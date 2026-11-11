import type { Note } from '../../data/model.ts';

/** A checklist line in a note, as seen by the Tasks integration. */
export interface TaskLine {
  noteId: string;
  lineId: string;
  taskId: string | null;
  /** Line is marked as a Google Task line. */
  isTask: boolean;
  title: string;
  completed: boolean;
  due: string | null;
}

const parse = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

function lineTitle(li: Element): string {
  const p = li.querySelector(':scope > p, :scope > div > p') ?? li;
  return (p.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** All checklist lines (task or not) in a note body. */
export function linesInNote(note: Note): TaskLine[] {
  if (!note.body.includes('taskItem')) return [];
  const d = parse(note.body);
  return Array.from(d.querySelectorAll('li[data-type="taskItem"]')).flatMap((li) => {
    const lineId = li.getAttribute('data-line-id');
    if (!lineId) return [];
    return [{
      noteId: note.id,
      lineId,
      taskId: li.getAttribute('data-task-id'),
      isTask: li.getAttribute('data-task-line') === 'true',
      title: lineTitle(li),
      completed: li.getAttribute('data-checked') === 'true',
      due: li.getAttribute('data-due'),
    }];
  });
}

/** Task lines across every note (including Recently deleted, so trashing a note doesn't delete its tasks). */
export function allTaskLines(notes: Record<string, Note>): TaskLine[] {
  return Object.values(notes).flatMap(linesInNote).filter((l) => l.isTask);
}

export interface LinePatch {
  taskId?: string | null;
  title?: string;
  completed?: boolean;
  due?: string | null;
  isTask?: boolean;
}

/** Apply patches (by line id) to a note body. Returns null when nothing changed. */
export function patchLines(html: string, patches: Map<string, LinePatch>): string | null {
  const d = parse(html);
  let changed = false;
  for (const [lineId, p] of patches) {
    const li = d.querySelector(`li[data-type="taskItem"][data-line-id="${CSS.escape(lineId)}"]`);
    if (!li) continue;
    const setAttr = (k: string, v: string | null) => {
      if ((li.getAttribute(k) ?? null) === v) return;
      if (v === null) li.removeAttribute(k);
      else li.setAttribute(k, v);
      changed = true;
    };
    if (p.taskId !== undefined) setAttr('data-task-id', p.taskId);
    if (p.completed !== undefined) setAttr('data-checked', String(p.completed));
    if (p.due !== undefined) setAttr('data-due', p.due);
    if (p.isTask !== undefined) setAttr('data-task-line', p.isTask ? 'true' : null);
    if (p.title !== undefined && lineTitle(li) !== p.title) {
      const para = li.querySelector(':scope > p, :scope > div > p');
      if (para) para.textContent = p.title;
      else li.prepend(Object.assign(d.createElement('p'), { textContent: p.title }));
      changed = true;
    }
  }
  return changed ? d.body.innerHTML : null;
}

/** Append a task line at the end of a note (used by Undo after a Google Task was deleted). */
export function appendTaskLine(html: string, line: { lineId: string; taskId: string; title: string; completed: boolean; due: string | null }): string {
  const d = parse(html);
  const ul = d.createElement('ul');
  ul.setAttribute('data-type', 'taskList');
  const li = d.createElement('li');
  li.setAttribute('data-type', 'taskItem');
  li.setAttribute('data-checked', String(line.completed));
  li.setAttribute('data-line-id', line.lineId);
  li.setAttribute('data-task-line', 'true');
  li.setAttribute('data-task-id', line.taskId);
  if (line.due) li.setAttribute('data-due', line.due);
  const p = d.createElement('p');
  p.textContent = line.title;
  li.append(p);
  ul.append(li);
  d.body.append(ul);
  return d.body.innerHTML;
}
