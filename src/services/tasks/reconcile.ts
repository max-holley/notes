import type { TaskLink } from '../../data/model.ts';
import { fromGoogleDue } from './dates.ts';
import type { LinePatch, TaskLine } from './lines.ts';

/** A Google Task line is deleted only after it has been absent from every note for this long. */
export const TASK_DELETE_GRACE_MS = 60_000;

export interface RemoteTask {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  due?: string | null;
  updated: string;
  deleted?: boolean;
}

export type TaskAction =
  | { type: 'create'; line: TaskLine }
  | { type: 'patchRemote'; taskId: string; title: string; completed: boolean; due: string | null }
  | { type: 'patchLine'; noteId: string; lineId: string; patch: LinePatch }
  | { type: 'setLink'; link: Omit<TaskLink, 'updatedAt'> }
  | { type: 'removeLink'; taskId: string }
  | { type: 'deleteRemote'; taskId: string; link: TaskLink };

const remoteState = (t: RemoteTask) => ({ title: t.title, completed: t.status === 'completed', due: fromGoogleDue(t.due) });

/**
 * Pure 3-way reconcile between note lines, the last agreed snapshot (link map) and Google Tasks.
 * `remote` is null when the remote list could not be read (then only local-only actions are planned).
 */
export function planReconcile(input: {
  lines: TaskLine[];
  links: Record<string, TaskLink>;
  remote: Map<string, RemoteTask> | null;
  noteUpdatedAt: (noteId: string) => number;
  now: number;
  graceMs?: number;
}): TaskAction[] {
  const { lines, links, remote, now } = input;
  const grace = input.graceMs ?? TASK_DELETE_GRACE_MS;
  const actions: TaskAction[] = [];
  const byTask = new Map<string, TaskLine>();
  for (const l of lines) if (l.taskId && !byTask.has(l.taskId)) byTask.set(l.taskId, l);

  // Empty lines (e.g. a fresh Actions item in a meeting note) become tasks once they have text.
  for (const l of lines) if (!l.taskId && l.title.trim()) actions.push({ type: 'create', line: l });

  for (const [taskId, line] of byTask) {
    const link = links[taskId];
    const r = remote?.get(taskId);
    if (remote && (!r || r.deleted)) {
      // Deleted in Google Tasks: keep the line, stop syncing it.
      actions.push({ type: 'patchLine', noteId: line.noteId, lineId: line.lineId, patch: { taskId: null, isTask: false } });
      if (link) actions.push({ type: 'removeLink', taskId });
      continue;
    }
    const lineState = { title: line.title, completed: line.completed, due: line.due };
    if (!link) {
      // Line carries a task id we have no snapshot for (import/paste from another account): adopt it.
      if (r) {
        actions.push({ type: 'patchRemote', taskId, ...lineState });
        actions.push({ type: 'setLink', link: { taskId, noteId: line.noteId, lineId: line.lineId, ...lineState, remoteUpdated: r.updated, missingSince: null } });
      }
      continue;
    }
    const lineChanged = line.title !== link.title || line.completed !== link.completed || line.due !== link.due;
    const rs = r ? remoteState(r) : null;
    const remoteChanged = !!rs && (rs.title !== link.title || rs.completed !== link.completed || rs.due !== link.due);
    let next = lineState;
    if (lineChanged && remoteChanged) {
      const remoteNewer = Date.parse(r!.updated) > input.noteUpdatedAt(line.noteId);
      next = remoteNewer ? rs! : lineState;
    } else if (remoteChanged) next = rs!;
    if (rs && (next.title !== rs.title || next.completed !== rs.completed || next.due !== rs.due)) actions.push({ type: 'patchRemote', taskId, ...next });
    if (next.title !== line.title || next.completed !== line.completed || next.due !== line.due) {
      actions.push({ type: 'patchLine', noteId: line.noteId, lineId: line.lineId, patch: next });
    }
    const moved = link.noteId !== line.noteId || link.lineId !== line.lineId;
    const changedSnapshot = next.title !== link.title || next.completed !== link.completed || next.due !== link.due;
    if (moved || changedSnapshot || link.missingSince || (r && r.updated !== link.remoteUpdated)) {
      actions.push({ type: 'setLink', link: { ...link, noteId: line.noteId, lineId: line.lineId, ...next, remoteUpdated: r?.updated ?? link.remoteUpdated, missingSince: null } });
    }
  }

  // Links whose line is gone from every note: start / finish the grace period.
  for (const link of Object.values(links)) {
    if (byTask.has(link.taskId)) continue;
    if (remote && !remote.has(link.taskId)) {
      actions.push({ type: 'removeLink', taskId: link.taskId });
      continue;
    }
    if (!link.missingSince) actions.push({ type: 'setLink', link: { ...link, missingSince: now } });
    else if (now - link.missingSince >= grace) actions.push({ type: 'deleteRemote', taskId: link.taskId, link });
  }
  return actions;
}

/** When the next grace-period deletion is due (ms from now), or null. */
export function nextGraceCheck(links: Record<string, TaskLink>, now: number, graceMs = TASK_DELETE_GRACE_MS): number | null {
  let min: number | null = null;
  for (const l of Object.values(links)) if (l.missingSince) min = Math.min(min ?? Infinity, Math.max(0, l.missingSince + graceMs - now));
  return min;
}
