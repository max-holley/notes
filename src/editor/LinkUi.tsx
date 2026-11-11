import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import TextSnippetOutlined from '@mui/icons-material/TextSnippetOutlined';
import type { Editor } from '@tiptap/core';
import { useState } from 'react';
import { isSafeUrl } from '../lib/sanitize.ts';
import { toast } from '../store/ui.ts';

export type LinkUiState =
  | { mode: 'edit'; x: number; y: number; href: string }
  | { mode: 'chip'; x: number; y: number; href: string }
  | { mode: 'menu'; x: number; y: number; href: string; text: string }
  | null;

const normalize = (u: string) => {
  const t = u.trim();
  if (!t) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('/') || t.startsWith('#')) return t;
  return t.includes('@') && !t.includes('/') ? `mailto:${t}` : `https://${t}`;
};

export function openLinkEditor(editor: Editor, set: (s: LinkUiState) => void) {
  const { from } = editor.state.selection;
  const c = editor.view.coordsAtPos(from);
  set({ mode: 'edit', x: c.left, y: c.bottom, href: (editor.getAttributes('link').href as string) ?? '' });
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    toast('Could not copy');
  }
}

export function LinkUi({ editor, state, set }: { editor: Editor; state: LinkUiState; set(s: LinkUiState): void }) {
  const [value, setValue] = useState('');
  const [lastHref, setLastHref] = useState<string | null>(null);
  if (state?.mode === 'edit' && lastHref !== state.href) {
    setLastHref(state.href);
    setValue(state.href);
  }
  if (state?.mode !== 'edit' && lastHref !== null) setLastHref(null);
  const close = () => set(null);
  const apply = () => {
    const href = normalize(value);
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!href) chain.unsetLink().run();
    else if (!isSafeUrl(href) && !href.startsWith('mailto:')) {
      toast('That link type is not allowed');
      return;
    } else if (editor.state.selection.empty && !editor.isActive('link')) {
      editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else chain.setLink({ href }).run();
    close();
  };
  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    close();
  };
  const edit = () => state && set({ ...state, mode: 'edit' });
  const open = () => state && window.open(state.href, '_blank', 'noopener,noreferrer');
  const pos = state ? { top: state.y + 4, left: state.x } : undefined;

  return (
    <>
      <Popover open={state?.mode === 'edit'} onClose={close} anchorReference="anchorPosition" anchorPosition={pos} disableRestoreFocus>
        <Stack direction="row" spacing={1} sx={{ p: 1.5, alignItems: 'center' }}>
          <TextField
            autoFocus
            size="small"
            placeholder="Paste a link, then Enter"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                apply();
              }
            }}
            slotProps={{ htmlInput: { 'aria-label': 'Link address', 'data-testid': 'link-input' } }}
            sx={{ width: 280 }}
          />
          <Button variant="contained" onClick={apply}>Apply</Button>
        </Stack>
      </Popover>
      <Popover open={state?.mode === 'chip'} onClose={close} anchorReference="anchorPosition" anchorPosition={pos} disableAutoFocus disableRestoreFocus>
        <Stack direction="row" spacing={0.5} sx={{ p: 0.5, pl: 1.5, alignItems: 'center', maxWidth: 420 }} data-testid="link-chip">
          <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }} component="a" href={state?.href} target="_blank" rel="noopener noreferrer" color="primary">
            {state?.href.replace(/^https?:\/\//, '').slice(0, 48)}
          </Typography>
          <Tooltip title="Copy link"><IconButton size="small" aria-label="Copy link" onClick={() => void copy(state!.href, 'Link')}><ContentCopyOutlined fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Edit link"><IconButton size="small" aria-label="Edit link" onClick={edit}><EditOutlined fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Remove link"><IconButton size="small" aria-label="Remove link" onClick={remove}><LinkOffOutlined fontSize="small" /></IconButton></Tooltip>
        </Stack>
      </Popover>
      <Menu open={state?.mode === 'menu'} onClose={close} anchorReference="anchorPosition" anchorPosition={pos}>
        <MenuItem onClick={() => { void copy(state!.href, 'Link'); close(); }}><ListItemIcon><ContentCopyOutlined fontSize="small" /></ListItemIcon><ListItemText>Copy link</ListItemText></MenuItem>
        <MenuItem onClick={() => { void copy(state?.mode === 'menu' ? state.text : '', 'Text'); close(); }}><ListItemIcon><TextSnippetOutlined fontSize="small" /></ListItemIcon><ListItemText>Copy text</ListItemText></MenuItem>
        <MenuItem onClick={() => { open(); close(); }}><ListItemIcon><OpenInNewOutlined fontSize="small" /></ListItemIcon><ListItemText>Open in new tab</ListItemText></MenuItem>
        <MenuItem onClick={edit}><ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon><ListItemText>Edit link</ListItemText></MenuItem>
        <MenuItem onClick={remove}><ListItemIcon><LinkOffOutlined fontSize="small" /></ListItemIcon><ListItemText>Remove link</ListItemText></MenuItem>
      </Menu>
      <Box sx={{ display: 'none' }} />
    </>
  );
}
