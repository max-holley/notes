import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { useState } from 'react';
import type { SectionType } from '../../theme/tokens.ts';

export const SECTION_TYPES: { type: SectionType; label: string; icon: typeof InfoOutlined }[] = [
  { type: 'info', label: 'Info', icon: InfoOutlined },
  { type: 'note', label: 'Note', icon: EditNoteOutlined },
  { type: 'success', label: 'Success', icon: CheckCircleOutlined },
  { type: 'warning', label: 'Warning', icon: WarningAmberOutlined },
  { type: 'error', label: 'Error', icon: ErrorOutlineOutlined },
];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    section: {
      insertSection: (type: SectionType) => ReturnType;
      setSectionType: (type: SectionType) => ReturnType;
    };
  }
}

function SectionView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const type = (node.attrs.type as SectionType) ?? 'info';
  const meta = SECTION_TYPES.find((s) => s.type === type) ?? SECTION_TYPES[0]!;
  const Icon = meta.icon;
  return (
    <NodeViewWrapper
      as="div"
      data-section={type}
      data-role={node.attrs.role ?? undefined}
      className={`section section-${type}`}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          my: 1,
          p: 1,
          pr: 2,
          borderRadius: 3,
          bgcolor: `sections.${type}.container`,
          color: `sections.${type}.onContainer`,
        }}
      >
        <Box contentEditable={false} sx={{ flexShrink: 0 }}>
          <IconButton
            size="small"
            aria-label={`${meta.label} section. Change section type`}
            onClick={(e) => setAnchor(e.currentTarget)}
            disabled={!editor.isEditable}
            sx={{ color: `sections.${type}.main` }}
            data-testid="section-icon"
          >
            <Icon fontSize="small" />
          </IconButton>
          <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
            {SECTION_TYPES.map((s) => (
              <MenuItem
                key={s.type}
                selected={s.type === type}
                onClick={() => {
                  updateAttributes({ type: s.type });
                  setAnchor(null);
                }}
              >
                <ListItemIcon sx={{ color: `sections.${s.type}.main` }}>
                  <s.icon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{s.label}</ListItemText>
              </MenuItem>
            ))}
          </Menu>
        </Box>
        <NodeViewContent as="div" style={{ flex: 1, minWidth: 0 }} />
      </Box>
    </NodeViewWrapper>
  );
}

/** Coloured callout block (Info / Note / Success / Warning / Error). Stored as <div data-section="type">. */
export const Section = Node.create({
  name: 'section',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-section') || 'info',
        renderHTML: (attrs) => ({ 'data-section': attrs.type as string }),
      },
      /** Optional role, e.g. "meeting-details" for calendar meeting headers. */
      role: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-role'),
        renderHTML: (attrs) => (attrs.role ? { 'data-role': attrs.role as string } : {}),
      },
    };
  },
  parseHTML: () => [{ tag: 'div[data-section]' }],
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: `section section-${HTMLAttributes['data-section'] as string}` }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SectionView);
  },
  addCommands() {
    return {
      insertSection:
        (type) =>
        ({ state, tr, dispatch }) => {
          const { $from, $to, empty } = state.selection;
          const schema = state.schema;
          if (!empty) {
            const range = $from.blockRange($to);
            if (!range) return false;
            if (dispatch) tr.wrap(range, [{ type: schema.nodes.section!, attrs: { type } }]);
            return true;
          }
          // Insert an empty section after the current top-level block and put the caret inside.
          const p = schema.nodes.paragraph!.create();
          const section = schema.nodes.section!.create({ type }, p);
          const isEmptyPara = $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0;
          if (dispatch) {
            if (isEmptyPara) {
              const pos = $from.before();
              tr.replaceWith(pos, $from.after(), section);
              tr.setSelection(TextSelection.create(tr.doc, pos + 2));
            } else {
              const pos = $from.after(1);
              tr.insert(pos, section);
              tr.setSelection(TextSelection.create(tr.doc, pos + 2));
            }
          }
          return true;
        },
      setSectionType:
        (type) =>
        ({ commands }) =>
          commands.updateAttributes('section', { type }),
    };
  },
});
