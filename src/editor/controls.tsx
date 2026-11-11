import type { SvgIconComponent } from '@mui/icons-material';
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined';
import BorderColorOutlined from '@mui/icons-material/BorderColorOutlined';
import ChecklistOutlined from '@mui/icons-material/ChecklistOutlined';
import CodeOutlined from '@mui/icons-material/CodeOutlined';
import DataObjectOutlined from '@mui/icons-material/DataObjectOutlined';
import FormatAlignLeftOutlined from '@mui/icons-material/FormatAlignLeftOutlined';
import FormatBoldOutlined from '@mui/icons-material/FormatBoldOutlined';
import FormatClearOutlined from '@mui/icons-material/FormatClearOutlined';
import FormatColorTextOutlined from '@mui/icons-material/FormatColorTextOutlined';
import FormatIndentDecreaseOutlined from '@mui/icons-material/FormatIndentDecreaseOutlined';
import FormatIndentIncreaseOutlined from '@mui/icons-material/FormatIndentIncreaseOutlined';
import FormatItalicOutlined from '@mui/icons-material/FormatItalicOutlined';
import FormatListBulletedOutlined from '@mui/icons-material/FormatListBulletedOutlined';
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined';
import FormatStrikethroughOutlined from '@mui/icons-material/FormatStrikethroughOutlined';
import FormatUnderlinedOutlined from '@mui/icons-material/FormatUnderlinedOutlined';
import HorizontalRuleOutlined from '@mui/icons-material/HorizontalRuleOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import InsertLinkOutlined from '@mui/icons-material/InsertLinkOutlined';
import RedoOutlined from '@mui/icons-material/RedoOutlined';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import TextFieldsOutlined from '@mui/icons-material/TextFieldsOutlined';
import UndoOutlined from '@mui/icons-material/UndoOutlined';
import type { Editor } from '@tiptap/core';
import type { ToolbarControlId } from './toolbarLayout.ts';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const mod = isMac ? '⌘' : 'Ctrl';
const k = (s: string) => s.replace(/Mod/g, mod).replace(/Alt/g, isMac ? '⌥' : 'Alt');

/** How a control behaves: a simple toggle/command, or a menu/popover rendered by the toolbar. */
export type ControlKind = 'button' | 'menu';

export interface ControlDef {
  id: ToolbarControlId;
  label: string;
  icon: SvgIconComponent;
  shortcut?: string;
  kind: ControlKind;
  run?: (e: Editor) => void;
  isActive?: (e: Editor) => boolean;
  isDisabled?: (e: Editor) => boolean;
}

export const BLOCK_STYLES = [
  { id: 'p', label: 'Body', shortcut: k('Mod+Alt+0'), run: (e: Editor) => e.chain().focus().setParagraph().run(), active: (e: Editor) => e.isActive('paragraph') },
  { id: 'h1', label: 'Title', shortcut: k('Mod+Alt+1'), run: (e: Editor) => e.chain().focus().setHeading({ level: 1 }).run(), active: (e: Editor) => e.isActive('heading', { level: 1 }) },
  { id: 'h2', label: 'Heading', shortcut: k('Mod+Alt+2'), run: (e: Editor) => e.chain().focus().setHeading({ level: 2 }).run(), active: (e: Editor) => e.isActive('heading', { level: 2 }) },
  { id: 'h3', label: 'Subheading', shortcut: k('Mod+Alt+3'), run: (e: Editor) => e.chain().focus().setHeading({ level: 3 }).run(), active: (e: Editor) => e.isActive('heading', { level: 3 }) },
  { id: 'quote', label: 'Quote', shortcut: k('Mod+Alt+4'), run: (e: Editor) => e.chain().focus().toggleBlockquote().run(), active: (e: Editor) => e.isActive('blockquote') },
] as const;

export const CONTROLS: Record<ToolbarControlId, ControlDef> = {
  blockStyle: { id: 'blockStyle', label: 'Text style', icon: TextFieldsOutlined, kind: 'menu' },
  bold: { id: 'bold', label: 'Bold', icon: FormatBoldOutlined, shortcut: k('Mod+B'), kind: 'button', run: (e) => e.chain().focus().toggleBold().run(), isActive: (e) => e.isActive('bold') },
  italic: { id: 'italic', label: 'Italic', icon: FormatItalicOutlined, shortcut: k('Mod+I'), kind: 'button', run: (e) => e.chain().focus().toggleItalic().run(), isActive: (e) => e.isActive('italic') },
  underline: { id: 'underline', label: 'Underline', icon: FormatUnderlinedOutlined, shortcut: k('Mod+U'), kind: 'button', run: (e) => e.chain().focus().toggleUnderline().run(), isActive: (e) => e.isActive('underline') },
  strike: { id: 'strike', label: 'Strikethrough', icon: FormatStrikethroughOutlined, shortcut: k('Mod+Shift+S'), kind: 'button', run: (e) => e.chain().focus().toggleStrike().run(), isActive: (e) => e.isActive('strike') },
  code: { id: 'code', label: 'Inline code', icon: CodeOutlined, shortcut: k('Mod+E'), kind: 'button', run: (e) => e.chain().focus().toggleCode().run(), isActive: (e) => e.isActive('code') },
  link: { id: 'link', label: 'Link', icon: InsertLinkOutlined, shortcut: k('Mod+K'), kind: 'menu', isActive: (e) => e.isActive('link') },
  clearFormatting: { id: 'clearFormatting', label: 'Clear formatting', icon: FormatClearOutlined, kind: 'button', run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run() },
  bulletList: { id: 'bulletList', label: 'Bulleted list', icon: FormatListBulletedOutlined, shortcut: k('Mod+Shift+8'), kind: 'button', run: (e) => e.chain().focus().toggleBulletList().run(), isActive: (e) => e.isActive('bulletList') },
  orderedList: { id: 'orderedList', label: 'Numbered list', icon: FormatListNumberedOutlined, shortcut: k('Mod+Shift+7'), kind: 'button', run: (e) => e.chain().focus().toggleOrderedList().run(), isActive: (e) => e.isActive('orderedList') },
  taskList: { id: 'taskList', label: 'Checklist', icon: ChecklistOutlined, shortcut: k('Mod+Shift+9'), kind: 'button', run: (e) => e.chain().focus().toggleTaskList().run(), isActive: (e) => e.isActive('taskList') },
  taskLine: { id: 'taskLine', label: 'Google Task line', icon: TaskAltOutlined, shortcut: '/task', kind: 'button', run: (e) => e.chain().focus().toggleTaskLine().run(), isActive: (e) => !!e.getAttributes('taskItem').taskLine },
  outdent: { id: 'outdent', label: 'Decrease indent', icon: FormatIndentDecreaseOutlined, shortcut: 'Shift+Tab', kind: 'button', run: (e) => e.chain().focus().outdent().run() },
  indent: { id: 'indent', label: 'Increase indent', icon: FormatIndentIncreaseOutlined, shortcut: 'Tab', kind: 'button', run: (e) => e.chain().focus().indent().run() },
  section: { id: 'section', label: 'Insert Section', icon: InfoOutlined, kind: 'menu', isActive: (e) => e.isActive('section') },
  table: { id: 'table', label: 'Insert table', icon: TableChartOutlined, kind: 'menu', isActive: (e) => e.isActive('table') },
  image: { id: 'image', label: 'Insert image', icon: AddPhotoAlternateOutlined, kind: 'menu' },
  horizontalRule: { id: 'horizontalRule', label: 'Divider', icon: HorizontalRuleOutlined, shortcut: k('Mod+Enter'), kind: 'button', run: (e) => e.chain().focus().setHorizontalRule().run() },
  codeBlock: { id: 'codeBlock', label: 'Code block', icon: DataObjectOutlined, shortcut: k('Mod+Alt+C'), kind: 'button', run: (e) => e.chain().focus().toggleCodeBlock().run(), isActive: (e) => e.isActive('codeBlock') },
  align: { id: 'align', label: 'Alignment', icon: FormatAlignLeftOutlined, kind: 'menu' },
  textColor: { id: 'textColor', label: 'Text colour', icon: FormatColorTextOutlined, kind: 'menu' },
  highlight: { id: 'highlight', label: 'Highlight', icon: BorderColorOutlined, kind: 'menu', isActive: (e) => e.isActive('highlight') },
  undo: { id: 'undo', label: 'Undo', icon: UndoOutlined, shortcut: k('Mod+Z'), kind: 'button', run: (e) => e.chain().focus().undo().run(), isDisabled: (e) => !e.can().undo() },
  redo: { id: 'redo', label: 'Redo', icon: RedoOutlined, shortcut: k('Mod+Shift+Z'), kind: 'button', run: (e) => e.chain().focus().redo().run(), isDisabled: (e) => !e.can().redo() },
};

export const tooltipFor = (c: ControlDef) => (c.shortcut ? `${c.label} (${c.shortcut})` : c.label);
