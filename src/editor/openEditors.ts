import type { Editor } from '@tiptap/core';
import type { LinePatch } from '../services/tasks/lines.ts';

/** Editors currently mounted, by note id. Integrations edit open notes through them so typing never races a store write. */
export const openEditors = new Map<string, Editor>();

/** Apply checklist-line patches inside a live editor. Returns false if no line matched. */
export function patchLinesInEditor(editor: Editor, patches: Map<string, LinePatch>): boolean {
  const { state } = editor;
  const tr = state.tr;
  let changed = false;
  const targets: { pos: number; node: import('@tiptap/pm/model').Node; patch: LinePatch }[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'taskItem' && patches.has(node.attrs.lineId as string)) targets.push({ pos, node, patch: patches.get(node.attrs.lineId as string)! });
  });
  // Apply from the end so earlier positions stay valid.
  for (const { pos, node, patch } of targets.reverse()) {
    const attrs = { ...node.attrs };
    if (patch.taskId !== undefined) attrs.taskId = patch.taskId;
    if (patch.completed !== undefined) attrs.checked = patch.completed;
    if (patch.due !== undefined) attrs.due = patch.due;
    if (patch.isTask !== undefined) attrs.taskLine = patch.isTask;
    if (JSON.stringify(attrs) !== JSON.stringify(node.attrs)) {
      tr.setNodeMarkup(pos, undefined, attrs);
      changed = true;
    }
    const para = node.firstChild;
    if (patch.title !== undefined && para && para.textContent !== patch.title) {
      const start = pos + 2;
      tr.replaceWith(start, start + para.content.size, patch.title ? state.schema.text(patch.title) : []);
      changed = true;
    }
  }
  if (changed) {
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  }
  return targets.length > 0;
}
