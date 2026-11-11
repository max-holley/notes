import { openEditors, patchLinesInEditor } from '../../editor/openEditors.ts';
import { useNotes } from '../../store/notes.ts';
import { patchLines, type LinePatch } from './lines.ts';

/** Patch checklist lines in a note: through its editor when open (no race with typing), else in the stored HTML. */
export function patchNoteLines(noteId: string, patches: Map<string, LinePatch>) {
  const ed = openEditors.get(noteId);
  if (ed && !ed.isDestroyed && patchLinesInEditor(ed, patches)) return;
  const s = useNotes.getState();
  const n = s.doc.notes[noteId];
  const html = n && patchLines(n.body, patches);
  if (html) s.updateNote(noteId, { body: html }, { content: false });
}
