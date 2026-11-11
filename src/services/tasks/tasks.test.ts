import { describe, expect, it } from 'vitest';
import type { Note, TaskLink } from '../../data/model.ts';
import { dueStatus, formatDue, fromGoogleDue, toGoogleDue } from './dates.ts';
import { allTaskLines, appendTaskLine, linesInNote, patchLines, type TaskLine } from './lines.ts';
import { nextGraceCheck, planReconcile, TASK_DELETE_GRACE_MS, type RemoteTask } from './reconcile.ts';
import { groupTasks } from './TasksView.tsx';

const li = (lineId: string, title: string, extra = '') =>
  `<ul data-type="taskList"><li data-type="taskItem" data-checked="false" data-line-id="${lineId}" data-task-line="true" ${extra}><p>${title}</p></li></ul>`;
const note = (id: string, body: string, updatedAt = 1): Note => ({
  id, title: id, body, categoryId: null, tags: [], pinned: false, archived: false, createdAt: 0, editedAt: 0, updatedAt,
});
const line = (p: Partial<TaskLine> = {}): TaskLine => ({ noteId: 'n', lineId: 'l', taskId: 't', isTask: true, title: 'A', completed: false, due: null, ...p });
const link = (p: Partial<TaskLink> = {}): TaskLink => ({ taskId: 't', noteId: 'n', lineId: 'l', title: 'A', completed: false, due: null, remoteUpdated: 'u1', missingSince: null, updatedAt: 0, ...p });
const remote = (p: Partial<RemoteTask> = {}) => new Map([['t', { id: 't', title: 'A', status: 'needsAction' as const, updated: 'u1', ...p }]]);
const plan = (lines: TaskLine[], links: Record<string, TaskLink>, r: Map<string, RemoteTask> | null, now = 1000, noteUpdatedAt = 0) =>
  planReconcile({ lines, links, remote: r, now, noteUpdatedAt: () => noteUpdatedAt });

describe('task lines in note HTML', () => {
  it('parses and patches task lines', () => {
    const n = note('n', li('l1', 'Buy milk', 'data-task-id="t1" data-due="2026-01-02"') + '<ul data-type="taskList"><li data-type="taskItem" data-line-id="l2"><p>plain</p></li></ul>');
    const lines = linesInNote(n);
    expect(lines).toHaveLength(2);
    expect(allTaskLines({ n })).toEqual([{ noteId: 'n', lineId: 'l1', taskId: 't1', isTask: true, title: 'Buy milk', completed: false, due: '2026-01-02' }]);
    const html = patchLines(n.body, new Map([['l1', { title: 'Buy oat milk', completed: true, due: null }]]))!;
    const [l] = allTaskLines({ n: { ...n, body: html } });
    expect(l).toMatchObject({ title: 'Buy oat milk', completed: true, due: null });
    expect(patchLines(html, new Map([['l1', { completed: true }]]))).toBeNull();
    expect(linesInNote(note('x', appendTaskLine('', { lineId: 'z', taskId: 'tz', title: 'Back', completed: false, due: null })))[0]).toMatchObject({ taskId: 'tz', title: 'Back' });
  });
});

describe('tasks reconciliation', () => {
  it('creates tasks for new task lines', () => {
    expect(plan([line({ taskId: null })], {}, new Map())).toEqual([{ type: 'create', line: line({ taskId: null }) }]);
  });

  it('pushes line edits (rename/complete/due) to Google', () => {
    const a = plan([line({ title: 'B', completed: true, due: '2026-02-01' })], { t: link() }, remote());
    expect(a).toContainEqual({ type: 'patchRemote', taskId: 't', title: 'B', completed: true, due: '2026-02-01' });
  });

  it('pulls Google edits (rename/complete) into the line', () => {
    const a = plan([line()], { t: link() }, remote({ title: 'Renamed', status: 'completed', updated: 'u2' }));
    expect(a).toContainEqual({ type: 'patchLine', noteId: 'n', lineId: 'l', patch: { title: 'Renamed', completed: true, due: null } });
    expect(a.find((x) => x.type === 'patchRemote')).toBeUndefined();
  });

  it('resolves conflicting edits by newest timestamp', () => {
    const r = remote({ title: 'Remote', updated: '2026-01-01T00:00:10Z' });
    const remoteWins = plan([line({ title: 'Local' })], { t: link() }, r, 1000, Date.parse('2026-01-01T00:00:05Z'));
    expect(remoteWins).toContainEqual(expect.objectContaining({ type: 'patchLine', patch: expect.objectContaining({ title: 'Remote' }) }));
    const localWins = plan([line({ title: 'Local' })], { t: link() }, r, 1000, Date.parse('2026-01-01T00:00:20Z'));
    expect(localWins).toContainEqual(expect.objectContaining({ type: 'patchRemote', title: 'Local' }));
  });

  it('waits the full 60 s grace period before deleting a missing line’s task', () => {
    const start = plan([], { t: link() }, remote(), 1000);
    expect(start).toEqual([{ type: 'setLink', link: expect.objectContaining({ missingSince: 1000 }) }]);
    const early = plan([], { t: link({ missingSince: 1000 }) }, remote(), 1000 + TASK_DELETE_GRACE_MS - 1);
    expect(early).toEqual([]);
    const due = plan([], { t: link({ missingSince: 1000 }) }, remote(), 1000 + TASK_DELETE_GRACE_MS);
    expect(due).toEqual([{ type: 'deleteRemote', taskId: 't', link: link({ missingSince: 1000 }) }]);
    expect(nextGraceCheck({ t: link({ missingSince: 1000 }) }, 2000)).toBe(TASK_DELETE_GRACE_MS - 1000);
  });

  it('cut/paste into another note within the grace period keeps the task (and moves the link)', () => {
    const a = plan([line({ noteId: 'other', lineId: 'l' })], { t: link({ missingSince: 1000 }) }, remote(), 30_000);
    expect(a.find((x) => x.type === 'deleteRemote')).toBeUndefined();
    expect(a).toContainEqual({ type: 'setLink', link: expect.objectContaining({ noteId: 'other', missingSince: null }) });
  });

  it('a task deleted in Google unlinks the line instead of recreating it', () => {
    const a = plan([line()], { t: link() }, new Map());
    expect(a).toContainEqual({ type: 'patchLine', noteId: 'n', lineId: 'l', patch: { taskId: null, isTask: false } });
    expect(a).toContainEqual({ type: 'removeLink', taskId: 't' });
  });

  it('only plans local actions when Google is unreachable', () => {
    const a = plan([line({ title: 'B' })], { t: link() }, null);
    expect(a.find((x) => x.type === 'removeLink')).toBeUndefined();
  });
});

describe('dates and grouping', () => {
  const now = new Date(2026, 4, 10, 12);
  it('formats and classifies due dates', () => {
    expect(dueStatus('2026-05-09', now)).toBe('overdue');
    expect(dueStatus('2026-05-10', now)).toBe('today');
    expect(dueStatus('2026-05-11', now)).toBe('upcoming');
    expect(formatDue('2026-05-10', now)).toBe('Today');
    expect(formatDue('2026-05-11', now)).toBe('Tomorrow');
    expect(fromGoogleDue(toGoogleDue('2026-05-11'))).toBe('2026-05-11');
  });
  it('orders groups by most urgent task, dated before undated', () => {
    const g = groupTasks(
      [line({ noteId: 'a', lineId: '1', due: null }), line({ noteId: 'b', lineId: '2', due: '2026-06-01' }), line({ noteId: 'a', lineId: '3', due: '2026-07-01' }), line({ noteId: 'c', lineId: '4', due: '2026-01-01' })],
      (id) => id,
      true,
    );
    expect(g.map((x) => x.noteId)).toEqual(['c', 'b', 'a']);
    expect(g[2]!.items.map((i) => i.lineId)).toEqual(['3', '1']);
  });
});
