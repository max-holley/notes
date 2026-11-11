import { sanitizeHtml } from '../lib/sanitize.ts';
import { markdownToNote, noteToMarkdown } from './markdown.ts';
import { CATEGORY_COLORS } from '../theme/tokens.ts';
import { DOC_VERSION, uid, type Category, type Note, type NotesDoc } from './model.ts';

export interface ExportFile {
  format: 'notes-export';
  version: number;
  exported: string;
  categories: Category[];
  notes: Note[];
  tags: string[];
}

export function exportJson(doc: NotesDoc, now = new Date()): ExportFile {
  return {
    format: 'notes-export',
    version: DOC_VERSION,
    exported: now.toISOString(),
    categories: Object.values(doc.categories),
    notes: Object.values(doc.notes).filter((n) => !n.trashedAt),
    tags: Object.keys(doc.tags),
  };
}

export const safeFileName = (title: string) => (title || 'Untitled').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);

export function exportMarkdown(notes: Note[]): { name: string; text: string }[] {
  const used = new Set<string>();
  return notes.map((n) => {
    let name = safeFileName(n.title);
    for (let i = 2; used.has(name); i++) name = `${safeFileName(n.title)} (${i})`;
    used.add(name);
    return { name: `${name}.md`, text: noteToMarkdown(n.title, n.body) };
  });
}

export interface ImportResult {
  notes: Note[];
  categories: Category[];
  tags: string[];
  invalid: string[];
}

type Loose = Record<string, unknown>;
const num = (...v: unknown[]) => {
  for (const x of v) {
    if (typeof x === 'number' && isFinite(x)) return x;
    if (typeof x === 'string' && !isNaN(Date.parse(x))) return Date.parse(x);
  }
  return Date.now();
};
const str = (...v: unknown[]) => (v.find((x) => typeof x === 'string') as string | undefined) ?? '';
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v && typeof v === 'object' ? (Object.values(v) as T[]) : []);

/**
 * Accepts: this app's export, the legacy v2 export (`{version:2, categories, notes}` with `category/created/updated`),
 * and the Apps Script Drive file shape (notes/categories as arrays or id-keyed maps; `content`/`html` bodies).
 */
export function parseJsonImport(text: string): Omit<ImportResult, 'invalid'> {
  const raw = JSON.parse(text) as Loose | Loose[];
  const root: Loose = Array.isArray(raw) ? { notes: raw } : raw;
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Loose;
  const rawNotes = list<Loose>(data.notes);
  if (!rawNotes.length && !Array.isArray(data.notes) && !(data.notes && typeof data.notes === 'object')) throw new Error('No notes found');
  const categories: Category[] = list<Loose>(data.categories).map((c, i) => ({
    id: str(c.id) || uid(),
    name: str(c.name, c.title).slice(0, 30) || 'Category',
    color: str(c.color, c.colour) || CATEGORY_COLORS[0]!,
    order: typeof c.order === 'number' ? c.order : i,
    archived: !!c.archived,
    updatedAt: num(c.updatedAt, c.updated),
  }));
  const tagSet = new Set<string>(list<string>(data.tags).map((t) => (typeof t === 'string' ? t : str((t as Loose).name))).filter(Boolean));
  const notes: Note[] = rawNotes.map((n) => {
    const created = num(n.createdAt, n.created);
    const updated = num(n.updatedAt, n.updated, n.modified, created);
    const tags = list<string>(n.tags).map((t) => String(t).replace(/^#/, '')).filter(Boolean);
    tags.forEach((t) => tagSet.add(t));
    return {
      id: str(n.id) || uid(),
      title: str(n.title, n.name),
      body: sanitizeHtml(str(n.body, n.html, n.content)),
      categoryId: (str(n.categoryId, n.category) || null),
      tags,
      pinned: !!n.pinned,
      archived: !!n.archived,
      createdAt: created,
      editedAt: num(n.editedAt, updated),
      updatedAt: updated,
      trashedAt: null,
      eventId: (str(n.eventId) || null),
    };
  });
  return { notes, categories, tags: [...tagSet] };
}

export async function importFiles(files: { name: string; text(): Promise<string> }[]): Promise<ImportResult> {
  const res: ImportResult = { notes: [], categories: [], tags: [], invalid: [] };
  for (const f of files) {
    const text = await f.text();
    const isMd = /\.(md|markdown|txt)$/i.test(f.name);
    const isJson = /\.json$/i.test(f.name) || (!isMd && /^\s*[[{]/.test(text));
    try {
      if (isJson) {
        const r = parseJsonImport(text);
        res.notes.push(...r.notes);
        res.categories.push(...r.categories);
        res.tags.push(...r.tags);
      } else if (isMd) {
        const { title, body } = markdownToNote(text, f.name.replace(/\.(md|markdown|txt)$/i, ''));
        const t = Date.now();
        res.notes.push({ id: uid(), title, body: sanitizeHtml(body), categoryId: null, tags: [], pinned: false, archived: false, createdAt: t, editedAt: t, updatedAt: t, trashedAt: null, eventId: null });
      } else res.invalid.push(f.name);
    } catch {
      res.invalid.push(f.name);
    }
  }
  return res;
}

/** Merge an import into the doc: categories matched by id or name; notes with an existing id overwrite it. */
export function planImport(doc: NotesDoc, r: ImportResult) {
  const catIdMap = new Map<string, string>();
  const newCats: Category[] = [];
  const existing = Object.values(doc.categories);
  for (const c of r.categories) {
    const match = existing.find((e) => e.id === c.id) ?? existing.find((e) => e.name.toLowerCase() === c.name.toLowerCase()) ?? newCats.find((e) => e.name.toLowerCase() === c.name.toLowerCase());
    if (match) catIdMap.set(c.id, match.id);
    else {
      newCats.push({ ...c, order: existing.length + newCats.length, updatedAt: Date.now() });
      catIdMap.set(c.id, c.id);
    }
  }
  const t = Date.now();
  const notes = r.notes.map((n) => ({
    ...n,
    categoryId: n.categoryId ? catIdMap.get(n.categoryId) ?? (doc.categories[n.categoryId] ? n.categoryId : null) : null,
    updatedAt: Math.max(t, n.updatedAt),
  }));
  return { categories: newCats, notes, tags: [...new Set(r.tags)] };
}
