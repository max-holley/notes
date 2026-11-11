import { Extension, type Editor } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

/** Blocks the caret can "step out of" (Enter on empty last line, Ctrl+Enter, arrows at the edge). */
const EXIT_CONTAINERS = ['section', 'blockquote', 'codeBlock', 'table'];
const CTRL_ENTER_CONTAINERS = [...EXIT_CONTAINERS, 'bulletList', 'orderedList', 'taskList'];
const LIST_ITEMS = ['listItem', 'taskItem'];

function isLastDescendant($pos: ResolvedPos, depth: number) {
  for (let d = depth; d < $pos.depth; d++) if ($pos.index(d) !== $pos.node(d).childCount - 1) return false;
  return true;
}
function isFirstDescendant($pos: ResolvedPos, depth: number) {
  for (let d = depth; d < $pos.depth; d++) if ($pos.index(d) !== 0) return false;
  return true;
}

/** Insert an empty paragraph at `pos` and put the caret in it. */
function paragraphAt(editor: Editor, pos: number) {
  const { state, view } = editor;
  const tr = state.tr.insert(pos, state.schema.nodes.paragraph!.create());
  tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView();
  view.dispatch(tr);
  return true;
}

/** Enter on the final empty line of a section/quote exits it. */
export function exitOnEmptyLastLine(editor: Editor): boolean {
  const { state, view } = editor;
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== 'paragraph' || $from.parent.content.size > 0 || $from.depth < 2) return false;
  const depth = $from.depth - 1;
  const container = $from.node(depth);
  if (!['section', 'blockquote'].includes(container.type.name)) return false;
  if ($from.index(depth) !== container.childCount - 1) return false;
  if (container.childCount === 1) return editor.commands.lift(container.type.name);
  const tr = state.tr.delete($from.before(), $from.after());
  const after = tr.mapping.map($from.after(depth));
  tr.insert(after, state.schema.nodes.paragraph!.create());
  tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
  view.dispatch(tr);
  return true;
}

/** Ctrl/Cmd+Enter: leave the innermost block container, or insert a divider with the caret on the next line. */
export function ctrlEnter(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if (CTRL_ENTER_CONTAINERS.includes($from.node(d).type.name)) return paragraphAt(editor, $from.after(d));
  }
  return editor.chain().setHorizontalRule().run();
}

/** ArrowDown at the end of the last line of a container that ends its parent: create/move to a line below it. */
export function arrowOut(editor: Editor, dir: 'up' | 'down'): boolean {
  const { $from, empty } = editor.state.selection;
  if (!empty || !$from.parent.isTextblock) return false;
  if (dir === 'down' && $from.parentOffset !== $from.parent.content.size) return false;
  if (dir === 'up' && $from.parentOffset !== 0) return false;
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name;
    if (!EXIT_CONTAINERS.includes(name)) continue;
    const edgeOk = dir === 'down' ? isLastDescendant($from, d) : isFirstDescendant($from, d);
    if (!edgeOk) return false;
    const parentIndex = $from.index(d - 1);
    const parent = $from.node(d - 1);
    if (dir === 'down' && parentIndex === parent.childCount - 1) return paragraphAt(editor, $from.after(d));
    if (dir === 'up' && parentIndex === 0) return paragraphAt(editor, $from.before(d));
    return false; // something follows/precedes: native arrow movement reaches it
  }
  return false;
}

/** Backspace at the very start of a section unwraps it, keeping all content. */
export function unwrapSectionAtStart(editor: Editor): boolean {
  const { state, view } = editor;
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  for (let d = $from.depth - 1; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name !== 'section') continue;
    if (!isFirstDescendant($from, d)) return false;
    const start = $from.before(d);
    const tr = state.tr.replaceWith(start, $from.after(d), node.content);
    tr.setSelection(TextSelection.near(tr.doc.resolve(start + ($from.pos - $from.start(d)) )));
    view.dispatch(tr.scrollIntoView());
    return true;
  }
  return false;
}

/** In a list item: Enter on an empty item / Backspace at the start converts the item to a paragraph (splitting the list). */
function liftItem(editor: Editor, requireEmpty: boolean): boolean {
  const { $from, empty } = editor.state.selection;
  if (!empty || $from.depth < 2 || $from.parentOffset !== 0) return false;
  const item = $from.node($from.depth - 1);
  if (!LIST_ITEMS.includes(item.type.name) || $from.index($from.depth - 1) !== 0) return false;
  if (requireEmpty && (item.childCount !== 1 || $from.parent.content.size > 0)) return false;
  return editor.commands.liftListItem(item.type.name);
}

/** Shift+Tab in the first table cell exits above the table. */
function shiftTabOutOfTable(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name !== 'table') continue;
    if (!isFirstDescendant($from, d)) return false;
    return $from.index(d - 1) === 0 ? paragraphAt(editor, $from.before(d)) : editor.commands.setTextSelection($from.before(d) - 1);
  }
  return false;
}

export const KeyboardBehaviours = Extension.create({
  name: 'keyboardBehaviours',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => exitOnEmptyLastLine(editor) || liftItem(editor, true),
      'Mod-Enter': ({ editor }) => ctrlEnter(editor),
      ArrowDown: ({ editor }) => arrowOut(editor, 'down'),
      ArrowUp: ({ editor }) => arrowOut(editor, 'up'),
      Backspace: ({ editor }) => unwrapSectionAtStart(editor) || liftItem(editor, false),
      'Shift-Tab': ({ editor }) => (editor.isActive('table') && !editor.can().goToPreviousCell() ? shiftTabOutOfTable(editor) : false),
      'Mod-Alt-4': ({ editor }) => editor.commands.toggleBlockquote(),
      'Mod-Alt-0': ({ editor }) => editor.commands.setParagraph(),
      'Mod-y': ({ editor }) => editor.commands.redo(),
      'Mod-Shift-9': ({ editor }) => editor.commands.toggleTaskList(),
    };
  },
});
