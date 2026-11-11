/** User-level actions shared by the sidebar, list, editor and dialogs (with confirmations + toasts). */
import { choose, confirm } from '../components/dialogs/confirm.tsx';
import { useNotes } from '../store/notes.ts';
import { toast, useUi } from '../store/ui.ts';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function newNote() {
  const ui = useUi.getState();
  const cat = ui.filterCategory && ui.filterCategory !== 'uncategorized' ? ui.filterCategory : null;
  const id = useNotes.getState().createNote({ categoryId: cat, tags: [...ui.filterTags] });
  ui.set({ view: 'notes', search: '' });
  ui.openNote(id);
  setTimeout(() => document.querySelector<HTMLInputElement>('[data-testid="note-title"] input, [data-testid="note-title"] textarea')?.focus(), 50);
  return id;
}

export function trashNote(id: string) {
  const s = useNotes.getState();
  s.trashNote(id);
  if (useUi.getState().selectedNoteId === id) useUi.getState().openNote(null);
  toast('Moved to Recently deleted', { label: 'Undo', run: () => s.restoreNote(id) });
}

export async function deleteForever(id: string) {
  const n = useNotes.getState().doc.notes[id];
  if (!n) return;
  if (await confirm('Delete this note forever?', <><strong>{n.title || 'Untitled note'}</strong> will be permanently deleted. This can’t be undone.</>, 'Delete forever')) {
    useNotes.getState().deleteForever(id);
    toast('Note deleted');
  }
}

export function toggleArchive(id: string) {
  const s = useNotes.getState();
  const n = s.doc.notes[id];
  if (!n) return;
  s.setArchived(id, !n.archived);
  const ui = useUi.getState();
  if (!n.archived && !ui.showArchived && ui.selectedNoteId === id) ui.openNote(null);
  toast(n.archived ? 'Note unarchived' : 'Note archived', { label: 'Undo', run: () => s.setArchived(id, n.archived) });
}

export function togglePin(id: string) {
  const s = useNotes.getState();
  const n = s.doc.notes[id];
  if (!n) return;
  s.setPinned(id, !n.pinned);
  toast(n.pinned ? 'Unpinned' : 'Pinned');
}

export async function archiveCategory(id: string) {
  const s = useNotes.getState();
  const c = s.doc.categories[id];
  if (!c) return;
  const active = Object.values(s.doc.notes).filter((n) => n.categoryId === id && !n.archived && !n.trashedAt).length;
  if (active && !(await confirm('Archive this category?', <><strong>{c.name}</strong> has {plural(active, 'note')}. {active === 1 ? 'It' : 'They'} will be archived too.</>, 'Archive', 'primary'))) return;
  s.archiveCategory(id);
  const ui = useUi.getState();
  if (ui.filterCategory === id && !ui.showArchived) ui.set({ filterCategory: null });
  toast('Category archived');
}

export async function unarchiveCategory(id: string) {
  const s = useNotes.getState();
  const c = s.doc.categories[id];
  if (!c) return;
  const archived = Object.values(s.doc.notes).filter((n) => n.categoryId === id && n.archived && !n.trashedAt).length;
  if (!archived) {
    s.unarchiveCategory(id, 'keep');
    toast('Category unarchived');
    return;
  }
  const them = archived === 1 ? 'it' : 'them';
  const choice = await choose(
    'Unarchive this category?',
    <><strong>{c.name}</strong> has {plural(archived, 'archived note')}. Restore {them}, keep {them} archived, or delete {them}? Deleted notes go to Recently deleted.</>,
    [
      { value: 'restore', label: 'Restore notes', variant: 'contained' },
      { value: 'keep', label: 'Keep notes archived' },
      { value: 'delete', label: 'Delete notes', color: 'error' },
    ],
    true,
  );
  if (!choice) return;
  s.unarchiveCategory(id, choice as 'restore' | 'keep' | 'delete');
  toast(choice === 'restore' ? 'Category and notes restored' : choice === 'delete' ? 'Category restored; notes moved to Recently deleted' : 'Category unarchived');
}

export async function deleteCategory(id: string) {
  const s = useNotes.getState();
  const c = s.doc.categories[id];
  if (!c) return;
  const n = Object.values(s.doc.notes).filter((x) => x.categoryId === id).length;
  if (await confirm('Delete this category?', <><strong>{c.name}</strong> will be deleted. Its {plural(n, 'note')} will move to <strong>Other</strong>.</>)) {
    s.deleteCategory(id);
    if (useUi.getState().filterCategory === id) useUi.getState().set({ filterCategory: null });
    toast('Category deleted');
  }
}

export async function deleteTag(name: string) {
  const s = useNotes.getState();
  const n = Object.values(s.doc.notes).filter((x) => x.tags.includes(name)).length;
  if (await confirm('Delete this tag?', <><strong>#{name}</strong> will be removed from {plural(n, 'note')}.</>)) {
    s.deleteTag(name);
    const ui = useUi.getState();
    ui.set({ filterTags: ui.filterTags.filter((t) => t !== name) });
    toast('Tag deleted');
  }
}
