import { describe, expect, it } from 'vitest';
import { mergeDocs } from '../sync/merge.ts';
import { useNotes } from './notes.ts';

describe('notes store', () => {
  it('tombstones beat an item stamped by a device whose clock runs ahead', () => {
    const s = useNotes.getState();
    s.reset();
    const id = s.createNote({ title: 'x' });
    const future = Date.now() + 120_000;
    useNotes.setState({ doc: { ...useNotes.getState().doc, notes: { [id]: { ...useNotes.getState().doc.notes[id]!, updatedAt: future } } } });
    const remote = structuredClone(useNotes.getState().doc);
    useNotes.getState().deleteForever(id);
    const t = useNotes.getState().doc.tombstones[`note:${id}`]!;
    expect(t.deletedAt).toBeGreaterThan(future);
    expect(mergeDocs(remote, useNotes.getState().doc).notes[id]).toBeUndefined();
  });

  it('deletes from another tab arrive as tombstones and are not resurrected', () => {
    const s = useNotes.getState();
    s.reset();
    const id = s.createNote({ title: 'y' });
    useNotes.getState().applyForeign([{ key: `notes:${id}`, col: 'notes', id, value: null, at: Date.now() + 1 }]);
    expect(useNotes.getState().doc.notes[id]).toBeUndefined();
    expect(useNotes.getState().doc.tombstones[`note:${id}`]).toBeDefined();
  });
});
