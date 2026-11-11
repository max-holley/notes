import { DOC_VERSION, TOMBSTONE_TTL_MS, TRASH_TTL_MS, defaultPrefs, emptyDoc, tombKey, type NotesDoc, type Tombstone } from '../data/model.ts';

type Stamped = { updatedAt: number };
type Collection = 'notes' | 'categories' | 'tags' | 'taskLinks';
const COLLECTIONS: [Collection, Tombstone['kind']][] = [['notes', 'note'], ['categories', 'category'], ['tags', 'tag'], ['taskLinks', 'taskLink']];

/** Deterministic tie-break so every device converges on the same winner. */
function newer<T extends Stamped>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

function mergeRecord<T extends Stamped>(a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = out[k] ? newer(out[k], v) : v;
  return out;
}

/**
 * Per-item last-writer-wins merge with tombstones.
 * - An item is dropped if a tombstone for it is at least as new as the item.
 * - Tombstones older than 90 days and trashed notes older than 30 days are purged.
 */
export function mergeDocs(a: NotesDoc, b: NotesDoc, now = Date.now()): NotesDoc {
  const out = emptyDoc();
  out.version = Math.max(a.version, b.version, DOC_VERSION);
  for (const [k, t] of [...Object.entries(a.tombstones), ...Object.entries(b.tombstones)]) {
    const cur = out.tombstones[k];
    if (!cur || t.deletedAt > cur.deletedAt) out.tombstones[k] = t;
  }
  for (const [col, kind] of COLLECTIONS) {
    const merged = mergeRecord<Stamped>(a[col] as Record<string, Stamped>, b[col] as Record<string, Stamped>);
    for (const [id, item] of Object.entries(merged)) {
      const t = out.tombstones[tombKey(kind, id)];
      if (t && t.deletedAt >= item.updatedAt) delete merged[id];
    }
    (out[col] as Record<string, Stamped>) = merged;
  }
  out.prefs = newer(a.prefs, b.prefs);
  out.taskListId = a.taskListId ?? b.taskListId ?? null;
  return gc(out, now);
}

/** Purge expired trash and tombstones. */
export function gc(doc: NotesDoc, now = Date.now()): NotesDoc {
  for (const n of Object.values(doc.notes)) {
    if (n.trashedAt && now - n.trashedAt > TRASH_TTL_MS) {
      delete doc.notes[n.id];
      doc.tombstones[tombKey('note', n.id)] = { kind: 'note', deletedAt: now };
    }
  }
  for (const [k, t] of Object.entries(doc.tombstones)) if (now - t.deletedAt > TOMBSTONE_TTL_MS) delete doc.tombstones[k];
  return doc;
}

/** Fill in defaults for docs written by older versions. */
export function normalizeDoc(raw: Partial<NotesDoc> | null | undefined): NotesDoc {
  const d = emptyDoc();
  if (!raw) return d;
  return {
    ...d,
    ...raw,
    version: DOC_VERSION,
    notes: raw.notes ?? {},
    categories: raw.categories ?? {},
    tags: raw.tags ?? {},
    tombstones: raw.tombstones ?? {},
    taskLinks: raw.taskLinks ?? {},
    prefs: migratePrefs(raw.prefs),
  };
}

/** Prefs migration: unknown keys dropped, missing keys defaulted, legacy values mapped. */
export function migratePrefs(raw: unknown): NotesDoc['prefs'] {
  const d = defaultPrefs();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const theme = r.theme === 'auto' ? 'system' : r.theme;
  return {
    theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : d.theme,
    accent: typeof r.accent === 'string' ? r.accent : typeof r.accentIdx === 'number' ? (['indigo', 'blue', 'purple', 'pink', 'teal', 'green', 'orange', 'red'][r.accentIdx] ?? d.accent) : d.accent,
    font: typeof r.font === 'string' ? r.font : d.font,
    sort: r.sort === 'created' ? 'created' : 'updated',
    sidebar: { ...d.sidebar, ...(typeof r.sidebar === 'object' && r.sidebar ? (r.sidebar as object) : {}) },
    toolbar: (r.toolbar as NotesDoc['prefs']['toolbar']) ?? null,
    tasksListName: typeof r.tasksListName === 'string' ? r.tasksListName : d.tasksListName,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  };
}

/** Item-level change for the outbox: `value === null` means deleted (tombstoned). */
export type Change =
  | { key: string; col: Collection; id: string; value: Stamped | null; at: number }
  | { key: 'prefs'; col: 'prefs'; id: 'prefs'; value: NotesDoc['prefs']; at: number }
  | { key: 'taskListId'; col: 'taskListId'; id: 'taskListId'; value: string | null; at: number };

export const KIND_OF: Record<Collection, Tombstone['kind']> = { notes: 'note', categories: 'category', tags: 'tag', taskLinks: 'taskLink' };

/** Apply outbox changes on top of a doc (used at start-up: pull from Drive, then replay unsynced edits). */
export function applyChanges(doc: NotesDoc, changes: Change[]): NotesDoc {
  const local = structuredClone(doc);
  for (const c of changes) {
    if (c.col === 'prefs') local.prefs = c.value;
    else if (c.col === 'taskListId') local.taskListId = c.value;
    else if (c.value === null) {
      delete (local[c.col] as Record<string, unknown>)[c.id];
      local.tombstones[tombKey(KIND_OF[c.col], c.id)] = { kind: KIND_OF[c.col], deletedAt: c.at };
    } else (local[c.col] as Record<string, unknown>)[c.id] = c.value;
  }
  return mergeDocs(doc, local);
}
