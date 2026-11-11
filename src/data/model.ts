import type { ToolbarLayout } from '../editor/toolbarLayout.ts';

export const DOC_VERSION = 3;
/** Tombstones are kept this long so deletes never resurrect from stale devices. */
export const TOMBSTONE_TTL_MS = 90 * 24 * 3600 * 1000;
/** Recently deleted notes are purged after this long. */
export const TRASH_TTL_MS = 30 * 24 * 3600 * 1000;

export interface Note {
  id: string;
  title: string;
  /** Sanitised HTML produced by the editor. */
  body: string;
  categoryId: string | null;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  createdAt: number;
  /** Last content edit (shown and used for "sort by updated"). Pin/archive do not change it. */
  editedAt: number;
  /** Last change of any kind (used for last-writer-wins sync). */
  updatedAt: number;
  /** Set when moved to Recently deleted. */
  trashedAt?: number | null;
  /** Google Calendar event this meeting note was created from. */
  eventId?: string | null;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  order: number;
  archived: boolean;
  updatedAt: number;
}

export interface Tag {
  name: string;
  updatedAt: number;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type SortKey = 'updated' | 'created';

export interface Prefs {
  theme: ThemeMode;
  accent: string;
  font: string;
  sort: SortKey;
  sidebar: { categories: boolean; tags: boolean; today: boolean };
  toolbar: ToolbarLayout | null;
  tasksListName: string;
  updatedAt: number;
}

/** Link between a Google Task and the note line it came from. Lives in the Drive file, never on the backend. */
export interface TaskLink {
  taskId: string;
  noteId: string;
  lineId: string;
  /** Last state both sides agreed on (used for 3-way reconcile). */
  title: string;
  completed: boolean;
  due: string | null;
  remoteUpdated: string;
  /** When the line was first seen missing from every note (deletion grace period). */
  missingSince: number | null;
  updatedAt: number;
}

export interface Tombstone {
  kind: 'note' | 'category' | 'tag' | 'taskLink';
  deletedAt: number;
}

export interface NotesDoc {
  version: number;
  notes: Record<string, Note>;
  categories: Record<string, Category>;
  tags: Record<string, Tag>;
  prefs: Prefs;
  /** key = `${kind}:${id}` */
  tombstones: Record<string, Tombstone>;
  taskLinks: Record<string, TaskLink>;
  /** Google Tasks list id used for task lines. */
  taskListId?: string | null;
}

export const defaultPrefs = (): Prefs => ({
  theme: 'system',
  accent: 'blue',
  font: 'roboto',
  sort: 'updated',
  sidebar: { categories: true, tags: true, today: true },
  toolbar: null,
  tasksListName: '',
  updatedAt: 0,
});

export const emptyDoc = (): NotesDoc => ({
  version: DOC_VERSION,
  notes: {},
  categories: {},
  tags: {},
  prefs: defaultPrefs(),
  tombstones: {},
  taskLinks: {},
  taskListId: null,
});

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

export const tombKey = (kind: Tombstone['kind'], id: string) => `${kind}:${id}`;

/** Plain text of a note body (for search, previews and stats). */
export function htmlToText(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  d.querySelectorAll('p,h1,h2,h3,li,blockquote,pre,div,td,th,br').forEach((el) => el.append(' '));
  return (d.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function wordStats(text: string) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { words, chars: text.length };
}

/** All tag names in use: registry + every note's tags. */
export function allTags(doc: NotesDoc): string[] {
  const set = new Set(Object.keys(doc.tags));
  for (const n of Object.values(doc.notes)) if (!n.trashedAt) n.tags.forEach((t) => set.add(t));
  return [...set].sort((a, b) => a.localeCompare(b));
}
