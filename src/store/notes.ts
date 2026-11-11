import { create } from 'zustand';
import { emptyDoc, tombKey, uid, type Category, type Note, type NotesDoc, type Prefs, type Tag, type TaskLink } from '../data/model.ts';
import { DEFAULT_CATEGORY_COLORS } from '../theme/tokens.ts';
import { mergeDocs, type Change } from '../sync/merge.ts';

/** Receives every local change (outbox + working copy + broadcast + sync schedule). Set by the sync bootstrap. */
export interface ChangeSink {
  onChanges(changes: Change[], doc: NotesDoc): void;
}
let sink: ChangeSink | null = null;
export const setChangeSink = (s: ChangeSink | null) => {
  sink = s;
};

type Col = 'notes' | 'categories' | 'tags' | 'taskLinks';

interface NotesState {
  doc: NotesDoc;
  loaded: boolean;
  /** Replace the whole doc (start-up). */
  load(doc: NotesDoc): void;
  /** Merge a remote doc (no outbox writes). */
  applyRemote(doc: NotesDoc): void;
  /** Apply changes coming from another tab (already in the shared outbox). */
  applyForeign(changes: Change[]): void;
  reset(): void;

  createNote(init?: Partial<Note>): string;
  updateNote(id: string, patch: Partial<Note>, opts?: { content?: boolean }): void;
  setPinned(id: string, pinned: boolean): void;
  setArchived(id: string, archived: boolean): void;
  trashNote(id: string): void;
  restoreNote(id: string): void;
  deleteForever(id: string): void;
  emptyTrash(): void;

  createCategory(name: string, color: string): string;
  updateCategory(id: string, patch: Partial<Category>): void;
  deleteCategory(id: string): void;
  archiveCategory(id: string): void;
  unarchiveCategory(id: string, notes: 'restore' | 'keep' | 'delete'): void;
  reorderCategories(ids: string[]): void;

  createTag(name: string): void;
  renameTag(from: string, to: string): void;
  deleteTag(name: string): void;
  toggleNoteTag(noteId: string, tag: string): void;

  setPrefs(patch: Partial<Prefs>): void;
  setTaskLink(link: TaskLink): void;
  removeTaskLink(taskId: string): void;
  setTaskListId(id: string | null): void;
  /** Bulk insert/overwrite (import). */
  importItems(items: { notes: Note[]; categories: Category[]; tags: string[] }): void;
}

const normTag = (t: string) => t.trim().replace(/^#+/, '').slice(0, 30);

export const useNotes = create<NotesState>()((set, get) => {
  /** Apply item writes (value null = delete with tombstone) and notify the sink. */
  function write(items: { col: Col; id: string; value: Note | Category | Tag | TaskLink | null }[], extra?: Change[]) {
    const now = Date.now();
    const doc = structuredClone(get().doc);
    const changes: Change[] = [];
    for (const it of items) {
      const kind = ({ notes: 'note', categories: 'category', tags: 'tag', taskLinks: 'taskLink' } as const)[it.col];
      if (it.value === null) {
        delete (doc[it.col] as Record<string, unknown>)[it.id];
        doc.tombstones[tombKey(kind, it.id)] = { kind, deletedAt: now };
      } else {
        (doc[it.col] as Record<string, unknown>)[it.id] = it.value;
        delete doc.tombstones[tombKey(kind, it.id)];
      }
      changes.push({ key: `${it.col}:${it.id}`, col: it.col, id: it.id, value: it.value, at: it.value?.updatedAt ?? now });
    }
    for (const c of extra ?? []) {
      if (c.col === 'prefs') doc.prefs = c.value;
      if (c.col === 'taskListId') doc.taskListId = c.value;
      changes.push(c);
    }
    set({ doc });
    sink?.onChanges(changes, doc);
  }
  const note = (id: string) => get().doc.notes[id];
  const touchNote = (id: string, patch: Partial<Note>, content = false) => {
    const n = note(id);
    if (!n) return;
    const t = Date.now();
    write([{ col: 'notes', id, value: { ...n, ...patch, updatedAt: Math.max(t, n.updatedAt + 1), ...(content ? { editedAt: t } : {}) } }]);
  };

  return {
    doc: emptyDoc(),
    loaded: false,
    load: (doc) => set({ doc, loaded: true }),
    applyRemote: (remote) => set({ doc: mergeDocs(get().doc, remote), loaded: true }),
    applyForeign(changes) {
      const doc = structuredClone(get().doc);
      for (const c of changes) {
        if (c.col === 'prefs') doc.prefs = c.value;
        else if (c.col === 'taskListId') doc.taskListId = c.value;
        else if (c.value === null) delete (doc[c.col] as Record<string, unknown>)[c.id];
        else (doc[c.col] as Record<string, unknown>)[c.id] = c.value;
      }
      set({ doc: mergeDocs(get().doc, doc) });
    },
    reset: () => set({ doc: emptyDoc(), loaded: false }),

    createNote(init = {}) {
      const t = Date.now();
      const n: Note = {
        id: uid(), title: '', body: '', categoryId: null, tags: [], pinned: false, archived: false,
        createdAt: t, editedAt: t, updatedAt: t, trashedAt: null, eventId: null, ...init,
      };
      write([{ col: 'notes', id: n.id, value: n }]);
      return n.id;
    },
    updateNote: (id, patch, opts) => touchNote(id, patch, opts?.content ?? true),
    setPinned: (id, pinned) => touchNote(id, { pinned }),
    setArchived: (id, archived) => touchNote(id, { archived }),
    trashNote: (id) => touchNote(id, { trashedAt: Date.now() }),
    restoreNote: (id) => touchNote(id, { trashedAt: null }),
    deleteForever: (id) => write([{ col: 'notes', id, value: null }]),
    emptyTrash: () => write(Object.values(get().doc.notes).filter((n) => n.trashedAt).map((n) => ({ col: 'notes' as const, id: n.id, value: null }))),

    createCategory(name, color) {
      const cats = Object.values(get().doc.categories);
      const c: Category = { id: uid(), name: name.trim().slice(0, 30), color, order: cats.length ? Math.max(...cats.map((x) => x.order)) + 1 : 0, archived: false, updatedAt: Date.now() };
      write([{ col: 'categories', id: c.id, value: c }]);
      return c.id;
    },
    updateCategory(id, patch) {
      const c = get().doc.categories[id];
      if (c) write([{ col: 'categories', id, value: { ...c, ...patch, updatedAt: Date.now() } }]);
    },
    deleteCategory(id) {
      const t = Date.now();
      const moved = Object.values(get().doc.notes).filter((n) => n.categoryId === id).map((n) => ({ col: 'notes' as const, id: n.id, value: { ...n, categoryId: null, updatedAt: t } }));
      write([...moved, { col: 'categories', id, value: null }]);
    },
    archiveCategory(id) {
      const t = Date.now();
      const c = get().doc.categories[id];
      if (!c) return;
      const notes = Object.values(get().doc.notes).filter((n) => n.categoryId === id && !n.archived && !n.trashedAt)
        .map((n) => ({ col: 'notes' as const, id: n.id, value: { ...n, archived: true, updatedAt: t } }));
      write([...notes, { col: 'categories', id, value: { ...c, archived: true, updatedAt: t } }]);
    },
    unarchiveCategory(id, mode) {
      const t = Date.now();
      const c = get().doc.categories[id];
      if (!c) return;
      const archived = Object.values(get().doc.notes).filter((n) => n.categoryId === id && n.archived && !n.trashedAt);
      const notes =
        mode === 'restore' ? archived.map((n) => ({ col: 'notes' as const, id: n.id, value: { ...n, archived: false, updatedAt: t } }))
        : mode === 'delete' ? archived.map((n) => ({ col: 'notes' as const, id: n.id, value: { ...n, trashedAt: t, updatedAt: t } }))
        : [];
      write([...notes, { col: 'categories', id, value: { ...c, archived: false, updatedAt: t } }]);
    },
    reorderCategories(ids) {
      const t = Date.now();
      write(ids.flatMap((id, order) => {
        const c = get().doc.categories[id];
        return c && c.order !== order ? [{ col: 'categories' as const, id, value: { ...c, order, updatedAt: t } }] : [];
      }));
    },

    createTag(name) {
      const n = normTag(name);
      if (n && !get().doc.tags[n]) write([{ col: 'tags', id: n, value: { name: n, updatedAt: Date.now() } }]);
    },
    renameTag(from, to) {
      const n = normTag(to);
      if (!n || n === from) return;
      const t = Date.now();
      const notes = Object.values(get().doc.notes).filter((x) => x.tags.includes(from)).map((x) => ({
        col: 'notes' as const, id: x.id, value: { ...x, tags: [...new Set(x.tags.map((g) => (g === from ? n : g)))], updatedAt: t },
      }));
      write([...notes, { col: 'tags', id: from, value: null }, { col: 'tags', id: n, value: { name: n, updatedAt: t } }]);
    },
    deleteTag(name) {
      const t = Date.now();
      const notes = Object.values(get().doc.notes).filter((x) => x.tags.includes(name)).map((x) => ({
        col: 'notes' as const, id: x.id, value: { ...x, tags: x.tags.filter((g) => g !== name), updatedAt: t },
      }));
      write([...notes, { col: 'tags', id: name, value: null }]);
    },
    toggleNoteTag(noteId, tag) {
      const n = note(noteId);
      const t = normTag(tag);
      if (!n || !t) return;
      const tags = n.tags.includes(t) ? n.tags.filter((x) => x !== t) : [...n.tags, t];
      const items: { col: Col; id: string; value: Note | Category | Tag | TaskLink | null }[] = [{ col: 'notes', id: noteId, value: { ...n, tags, updatedAt: Date.now() } }];
      if (!get().doc.tags[t]) items.push({ col: 'tags', id: t, value: { name: t, updatedAt: Date.now() } });
      write(items);
    },

    setPrefs(patch) {
      const prefs = { ...get().doc.prefs, ...patch, updatedAt: Date.now() };
      write([], [{ key: 'prefs', col: 'prefs', id: 'prefs', value: prefs, at: prefs.updatedAt }]);
    },
    setTaskLink: (link) => write([{ col: 'taskLinks', id: link.taskId, value: { ...link, updatedAt: Date.now() } }]),
    removeTaskLink: (taskId) => write([{ col: 'taskLinks', id: taskId, value: null }]),
    setTaskListId: (id) => write([], [{ key: 'taskListId', col: 'taskListId', id: 'taskListId', value: id, at: Date.now() }]),
    importItems({ notes, categories, tags }) {
      const t = Date.now();
      write([
        ...categories.map((c) => ({ col: 'categories' as const, id: c.id, value: c })),
        ...notes.map((n) => ({ col: 'notes' as const, id: n.id, value: n })),
        ...tags.filter((g) => !get().doc.tags[g]).map((g) => ({ col: 'tags' as const, id: g, value: { name: g, updatedAt: t } })),
      ]);
    },
  };
});

/** First-run defaults (only when the user has never had any categories). */
export function seedDefaults() {
  const s = useNotes.getState();
  if (Object.keys(s.doc.categories).length || Object.keys(s.doc.notes).length || Object.keys(s.doc.tombstones).length) return;
  for (const [name, color] of Object.entries(DEFAULT_CATEGORY_COLORS)) s.createCategory(name, color);
}
