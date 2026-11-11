import { htmlToText, type Category, type Note, type NotesDoc, type SortKey } from './model.ts';

export interface ListFilter {
  category: string | null | 'uncategorized';
  tags: string[];
  search: string;
  showArchived: boolean;
  sort: SortKey;
}

const textCache = new Map<string, { body: string; text: string }>();
/** Cached plain text of a note body. */
export function noteText(n: Note): string {
  const c = textCache.get(n.id);
  if (c && c.body === n.body) return c.text;
  const text = htmlToText(n.body);
  textCache.set(n.id, { body: n.body, text });
  return text;
}

export function activeCategories(doc: NotesDoc, includeArchived = false): Category[] {
  return Object.values(doc.categories)
    .filter((c) => includeArchived || !c.archived)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export const isLive = (n: Note) => !n.trashedAt;

export function filterNotes(doc: NotesDoc, f: ListFilter): { pinned: Note[]; others: Note[] } {
  const q = f.search.trim().toLowerCase();
  const cats = doc.categories;
  const list = Object.values(doc.notes).filter((n) => {
    if (!isLive(n)) return false;
    if (n.archived && !f.showArchived) return false;
    if (f.category === 'uncategorized') {
      if (n.categoryId && cats[n.categoryId]) return false;
    } else if (f.category && n.categoryId !== f.category) return false;
    if (f.tags.length && !f.tags.every((t) => n.tags.includes(t))) return false;
    if (q && !(n.title.toLowerCase().includes(q) || noteText(n).toLowerCase().includes(q) || n.tags.join(' ').toLowerCase().includes(q))) return false;
    return true;
  });
  const key = f.sort === 'created' ? 'createdAt' : 'editedAt';
  list.sort((a, b) => b[key] - a[key] || a.id.localeCompare(b.id));
  return { pinned: list.filter((n) => n.pinned), others: list.filter((n) => !n.pinned) };
}

export function categoryCounts(doc: NotesDoc, showArchived: boolean) {
  const counts: Record<string, number> = { all: 0, uncategorized: 0 };
  for (const n of Object.values(doc.notes)) {
    if (!isLive(n) || (n.archived && !showArchived)) continue;
    counts.all!++;
    const key = n.categoryId && doc.categories[n.categoryId] ? n.categoryId : 'uncategorized';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function tagCounts(doc: NotesDoc): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of Object.keys(doc.tags)) counts[t] = 0;
  for (const n of Object.values(doc.notes)) if (isLive(n)) for (const t of n.tags) counts[t] = (counts[t] ?? 0) + 1;
  return counts;
}

export function trashedNotes(doc: NotesDoc): Note[] {
  return Object.values(doc.notes).filter((n) => n.trashedAt).sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
}

export function stats(doc: NotesDoc) {
  const live = Object.values(doc.notes).filter(isLive);
  let words = 0;
  for (const n of live) words += noteText(n).split(/\s+/).filter(Boolean).length;
  return {
    notes: live.length,
    archived: live.filter((n) => n.archived).length,
    pinned: live.filter((n) => n.pinned).length,
    categories: Object.values(doc.categories).filter((c) => !c.archived).length,
    tags: Object.keys(tagCounts(doc)).length,
    trashed: Object.values(doc.notes).length - live.length,
    words,
  };
}

/** Legacy card date: time if today, weekday if within a week, else "Mon D". */
export function shortDate(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (now - ts < 7 * 86400000) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
