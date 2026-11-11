import { brand } from '../../brand/brand.config.ts';
import { uid } from '../../data/model.ts';
import { openEditors } from '../../editor/openEditors.ts';
import { sanitizeHtml } from '../../lib/sanitize.ts';
import { useNotes } from '../../store/notes.ts';
import { patchNoteLines } from './apply.ts';
import { toast, useUi } from '../../store/ui.ts';
import { tasksClient } from './client.ts';
import { allTaskLines, appendTaskLine, type LinePatch } from './lines.ts';
import { nextGraceCheck, planReconcile, type RemoteTask } from './reconcile.ts';

const connected = () => !!useUi.getState().me?.services.includes('tasks');
const deepLink = (noteId: string) => `${location.origin}/app?note=${encodeURIComponent(noteId)}`;

let running: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
let graceTimer: ReturnType<typeof setTimeout> | null = null;

/** The list used for task lines (created on first use; name from prefs, default = app name). */
async function ensureList(): Promise<string> {
  const s = useNotes.getState();
  const name = s.doc.prefs.tasksListName || brand.appName;
  const lists = await tasksClient.lists();
  const known = s.doc.taskListId ? lists.find((l) => l.id === s.doc.taskListId) : undefined;
  if (known) return known.id;
  const byName = lists.find((l) => l.title === name) ?? (await tasksClient.createList(name));
  s.setTaskListId(byName.id);
  return byName.id;
}

function applyLinePatches(patches: { noteId: string; lineId: string; patch: LinePatch }[]) {
  const byNote = new Map<string, Map<string, LinePatch>>();
  for (const p of patches) {
    const m = byNote.get(p.noteId) ?? new Map<string, LinePatch>();
    m.set(p.lineId, { ...m.get(p.lineId), ...p.patch });
    byNote.set(p.noteId, m);
  }
  for (const [noteId, m] of byNote) patchNoteLines(noteId, m);
}

/** Notes with open editors' live content (unsaved typing included), so reconcile never sees stale lines. */
function liveNotes() {
  const notes = { ...useNotes.getState().doc.notes };
  for (const [id, ed] of openEditors) if (notes[id] && !ed.isDestroyed) notes[id] = { ...notes[id]!, body: sanitizeHtml(ed.getHTML()) };
  return notes;
}

async function reconcileOnce() {
  const listId = await ensureList();
  const remote: Map<string, RemoteTask> | null = await tasksClient
    .tasks(listId)
    .then((list) => new Map(list.map((t) => [t.id, t])))
    .catch(() => null);
  const s = useNotes.getState();
  const actions = planReconcile({
    lines: allTaskLines(liveNotes()),
    links: s.doc.taskLinks,
    remote,
    noteUpdatedAt: (id) => s.doc.notes[id]?.updatedAt ?? 0,
    now: Date.now(),
  });
  const linePatches: { noteId: string; lineId: string; patch: LinePatch }[] = [];
  for (const a of actions) {
    switch (a.type) {
      case 'create': {
        const t = await tasksClient.insert(listId, { title: a.line.title || 'Untitled task', completed: a.line.completed, due: a.line.due, notes: deepLink(a.line.noteId) });
        linePatches.push({ noteId: a.line.noteId, lineId: a.line.lineId, patch: { taskId: t.id } });
        useNotes.getState().setTaskLink({ taskId: t.id, noteId: a.line.noteId, lineId: a.line.lineId, title: a.line.title, completed: a.line.completed, due: a.line.due, remoteUpdated: t.updated, missingSince: null, updatedAt: 0 });
        break;
      }
      case 'patchRemote': {
        const t = await tasksClient.patch(listId, a.taskId, a);
        const link = useNotes.getState().doc.taskLinks[a.taskId];
        if (link) useNotes.getState().setTaskLink({ ...link, title: a.title, completed: a.completed, due: a.due, remoteUpdated: t.updated, missingSince: null });
        break;
      }
      case 'patchLine':
        linePatches.push({ noteId: a.noteId, lineId: a.lineId, patch: a.patch });
        break;
      case 'setLink':
        useNotes.getState().setTaskLink({ ...a.link, updatedAt: 0 });
        break;
      case 'removeLink':
        useNotes.getState().removeTaskLink(a.taskId);
        break;
      case 'deleteRemote': {
        await tasksClient.remove(listId, a.taskId).catch(() => undefined);
        useNotes.getState().removeTaskLink(a.taskId);
        const link = a.link;
        toast(`Deleted Google Task “${link.title || 'Untitled task'}”`, { label: 'Undo', run: () => void restoreDeleted(link) });
        break;
      }
    }
  }
  applyLinePatches(linePatches);
  scheduleGrace();
}

/** Undo for a grace-period deletion: recreate the task and put the line back in its note. */
async function restoreDeleted(link: { noteId: string; title: string; completed: boolean; due: string | null }) {
  const listId = await ensureList();
  const t = await tasksClient.insert(listId, { title: link.title, completed: link.completed, due: link.due, notes: deepLink(link.noteId) });
  const s = useNotes.getState();
  const n = s.doc.notes[link.noteId];
  const lineId = uid();
  const line = { lineId, taskId: t.id, title: link.title, completed: link.completed, due: link.due };
  const ed = openEditors.get(link.noteId);
  if (ed && !ed.isDestroyed) ed.commands.insertContentAt(ed.state.doc.content.size, appendTaskLine('', line));
  else if (n) s.updateNote(n.id, { body: appendTaskLine(n.body, line) });
  s.setTaskLink({ taskId: t.id, noteId: link.noteId, lineId, title: link.title, completed: link.completed, due: link.due, remoteUpdated: t.updated, missingSince: null, updatedAt: 0 });
  toast('Task restored');
}

function scheduleGrace() {
  if (graceTimer) clearTimeout(graceTimer);
  const wait = nextGraceCheck(useNotes.getState().doc.taskLinks, Date.now());
  if (wait !== null) graceTimer = setTimeout(() => void reconcileTasks(), wait + 50);
}

/** Run a reconcile (single flight; a request during a run triggers one more run). */
export function reconcileTasks(): Promise<void> {
  if (!connected() || !useNotes.getState().loaded) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = reconcileOnce()
    .catch((e: unknown) => {
      console.warn('Tasks sync failed', e instanceof Error ? e.message : 'error');
    })
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void reconcileTasks();
      }
    });
  return running;
}

/** Debounced reconcile after note edits. */
export function scheduleTasksReconcile(ms = 1500) {
  if (!connected()) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void reconcileTasks(), ms);
}
