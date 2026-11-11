import { Extension } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { NotesImage } from './image.tsx';
import { KeyboardBehaviours } from './keyboard.ts';
import { Section } from './section.tsx';
import { NotesTaskItem } from './taskItem.tsx';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: { indent: () => ReturnType; outdent: () => ReturnType };
  }
}

const MAX_INDENT = 6;
/** Paragraph/heading indent (lists use sink/lift instead). */
const Indent = Extension.create({
  name: 'indent',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => Number(el.getAttribute('data-indent')) || 0,
            renderHTML: (a) => (a.indent ? { 'data-indent': String(a.indent), style: `margin-left: ${(a.indent as number) * 2}em` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    const change = (delta: number) => () => ({ editor, chain, state }: { editor: import('@tiptap/core').Editor; chain: () => import('@tiptap/core').ChainedCommands; state: import('@tiptap/pm/state').EditorState }) => {
      for (const item of ['taskItem', 'listItem']) {
        if (editor.isActive(item)) return delta > 0 ? chain().sinkListItem(item).run() : chain().liftListItem(item).run();
      }
      const { $from } = state.selection;
      const node = $from.parent;
      if (!['paragraph', 'heading'].includes(node.type.name)) return false;
      const indent = Math.max(0, Math.min(MAX_INDENT, ((node.attrs.indent as number) ?? 0) + delta));
      return chain().updateAttributes(node.type.name, { indent }).run();
    };
    return { indent: change(1), outdent: change(-1) };
  },
});

export function buildExtensions(placeholder = 'Start writing…') {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
      code: {},
      trailingNode: {},
    }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskList,
    NotesTaskItem.configure({ nested: true }),
    Table.configure({ resizable: false, HTMLAttributes: { class: 'note-table' } }),
    TableRow,
    TableHeader,
    TableCell,
    NotesImage,
    Section,
    Indent,
    KeyboardBehaviours,
    Placeholder.configure({ placeholder }),
  ];
}
