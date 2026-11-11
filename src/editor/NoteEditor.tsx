import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddOutlined from '@mui/icons-material/AddOutlined';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import PushPinOutlined from '@mui/icons-material/PushPinOutlined';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toggleArchive, togglePin, trashNote } from '../app/actions.tsx';
import { NoteTagsDialog } from '../components/dialogs/NoteTagsDialog.tsx';
import { exportMarkdown } from '../data/importExport.ts';
import { wordStats } from '../data/model.ts';
import { activeCategories } from '../data/selectors.ts';
import { downloadText } from '../lib/download.ts';
import { compressImage } from '../lib/image.ts';
import { sanitizeHtml } from '../lib/sanitize.ts';
import { createGoogleDoc, uploadImage } from '../services/drive/client.ts';
import { services } from '../services/index.ts';
import { useNotes } from '../store/notes.ts';
import { toast, useUi } from '../store/ui.ts';
import { buildExtensions } from './extensions/index.ts';
import { LinkUi, openLinkEditor, type LinkUiState } from './LinkUi.tsx';
import { editorContentSx } from './styles.ts';
import { Toolbar } from './Toolbar.tsx';

const SAVE_DEBOUNCE_MS = 400;

export async function insertImages(editor: Editor, files: File[]) {
  const imgs = files.filter((f) => f.type.startsWith('image/'));
  for (const f of imgs) {
    try {
      toast('Uploading image…');
      const blob = await compressImage(f);
      const driveId = await uploadImage(blob, f.name.replace(/\.[^.]+$/, '') + (blob.type === 'image/webp' ? '.webp' : blob.type === 'image/jpeg' ? '.jpg' : ''));
      editor.chain().focus().insertContent({ type: 'image', attrs: { driveId, alt: f.name } }).run();
    } catch {
      toast('Image upload failed. Check your connection and try again.');
    }
  }
  return imgs.length > 0;
}

function TableMenu({ editor, anchor, onClose }: { editor: Editor; anchor: { x: number; y: number } | null; onClose(): void }) {
  const run = (fn: () => boolean) => () => {
    fn();
    onClose();
  };
  const c = () => editor.chain().focus();
  return (
    <Menu open={!!anchor} onClose={onClose} anchorReference="anchorPosition" anchorPosition={anchor ? { top: anchor.y, left: anchor.x } : undefined}>
      <MenuItem onClick={run(() => c().addRowBefore().run())}>Insert row above</MenuItem>
      <MenuItem onClick={run(() => c().addRowAfter().run())}>Insert row below</MenuItem>
      <MenuItem onClick={run(() => c().addColumnBefore().run())}>Insert column left</MenuItem>
      <MenuItem onClick={run(() => c().addColumnAfter().run())}>Insert column right</MenuItem>
      <Divider />
      <MenuItem onClick={run(() => c().deleteRow().run())}>Delete row</MenuItem>
      <MenuItem onClick={run(() => c().deleteColumn().run())}>Delete column</MenuItem>
      <MenuItem onClick={run(() => c().deleteTable().run())} sx={{ color: 'error.main' }}>Delete table</MenuItem>
    </Menu>
  );
}

export function NoteEditor({ noteId, compact }: { noteId: string; compact: boolean }) {
  const note = useNotes((s) => s.doc.notes[noteId]);
  const doc = useNotes((s) => s.doc);
  const updateNote = useNotes((s) => s.updateNote);
  const ui = useUi();
  const connected = ui.me?.services ?? [];
  const [title, setTitle] = useState(note?.title ?? '');
  const [link, setLink] = useState<LinkUiState>(null);
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number } | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [stats, setStats] = useState(() => wordStats(''));
  const fileInput = useRef<HTMLInputElement>(null);
  const lastSaved = useRef(note?.body ?? '');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);

  const flush = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const e = editorRef.current;
    if (!e || e.isDestroyed) return;
    const html = sanitizeHtml(e.getHTML());
    if (html !== lastSaved.current && useNotes.getState().doc.notes[noteId]) {
      lastSaved.current = html;
      updateNote(noteId, { body: html });
    }
  };

  const editor = useEditor({
    extensions: useMemo(() => buildExtensions(), []),
    content: sanitizeHtml(note?.body ?? ''),
    editorProps: {
      attributes: { 'aria-label': 'Note body', 'data-testid': 'editor', spellcheck: 'true', class: 'note-body' },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          if (editorRef.current) openLinkEditor(editorRef.current, setLink);
          return true;
        }
        void view;
        return false;
      },
      handleClick: (_view, _pos, event) => {
        const a = (event.target as HTMLElement).closest('a');
        if (!a) return false;
        const href = a.getAttribute('href') ?? '';
        if (event.ctrlKey || event.metaKey) {
          window.open(href, '_blank', 'noopener,noreferrer');
          return true;
        }
        const r = a.getBoundingClientRect();
        setLink({ mode: 'chip', x: r.left, y: r.bottom, href });
        return false;
      },
      handleDOMEvents: {
        contextmenu: (view, event) => {
          const target = event.target as HTMLElement;
          const a = target.closest('a');
          // Links are not prose: custom menu. Everything else keeps the native (spell-check) menu
          // unless Ctrl/Shift is held (table row/column menu).
          if (a && !event.ctrlKey && !event.shiftKey) {
            event.preventDefault();
            setLink({ mode: 'menu', x: event.clientX, y: event.clientY, href: a.getAttribute('href') ?? '', text: a.textContent ?? '' });
            return true;
          }
          if ((event.ctrlKey || event.shiftKey) && target.closest('td,th')) {
            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (pos) editorRef.current?.commands.setTextSelection(pos.pos);
            setTableMenu({ x: event.clientX, y: event.clientY });
            return true;
          }
          return false;
        },
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.some((f) => f.type.startsWith('image/')) || !editorRef.current) return false;
        void insertImages(editorRef.current, files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        if (!files.some((f) => f.type.startsWith('image/')) || !editorRef.current) return false;
        event.preventDefault();
        void insertImages(editorRef.current, files);
        return true;
      },
    },
    onCreate: ({ editor: e }) => setStats(wordStats(e.getText())),
    onUpdate: ({ editor: e }) => {
      setStats(wordStats(e.getText()));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    onBlur: () => flush(),
  });
  editorRef.current = editor;

  // Flush pending edits when switching notes / unmounting / hiding the page.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply external changes (sync from another device, Tasks reconcile) when the body changed elsewhere.
  useEffect(() => {
    if (!editor || !note || note.body === lastSaved.current) return;
    const current = sanitizeHtml(editor.getHTML());
    if (current === note.body) {
      lastSaved.current = note.body;
      return;
    }
    if (saveTimer.current) return; // local edit pending: it wins (LWW) and will be saved shortly
    const { from } = editor.state.selection;
    editor.commands.setContent(sanitizeHtml(note.body), { emitUpdate: false });
    lastSaved.current = note.body;
    editor.commands.setTextSelection(Math.min(from, editor.state.doc.content.size));
  }, [editor, note]);

  useEffect(() => {
    if (note && note.title !== title && document.activeElement?.getAttribute('data-title') !== 'true') setTitle(note.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.title]);

  // Opened from the Tasks view: put the caret on that line.
  useEffect(() => {
    if (!editor || !ui.focusLineId) return;
    let target = -1;
    editor.state.doc.descendants((n, pos) => {
      if (target < 0 && n.attrs.lineId === ui.focusLineId) target = pos;
    });
    if (target >= 0) {
      editor.chain().focus().setTextSelection(target + 2).scrollIntoView().run();
      editor.view.dom.querySelector(`[data-line-id="${ui.focusLineId}"]`)?.scrollIntoView({ block: 'center' });
    }
    ui.set({ focusLineId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, ui.focusLineId]);

  if (!note || !editor) return null;
  const cats = activeCategories(doc).concat(note.categoryId && doc.categories[note.categoryId]?.archived ? [doc.categories[note.categoryId]!] : []);

  const saveTitle = (v: string) => {
    setTitle(v);
    updateNote(noteId, { title: v });
  };
  const sendToDoc = async () => {
    setMoreAnchor(null);
    flush();
    const win = window.open('', '_blank');
    try {
      toast('Creating Google Doc…');
      const n = useNotes.getState().doc.notes[noteId]!;
      const { webViewLink } = await createGoogleDoc(n.title, sanitizeHtml(n.body));
      if (win) win.location.href = webViewLink;
      else window.open(webViewLink, '_blank', 'noopener');
      toast('Google Doc created in your Notes folder');
    } catch {
      win?.close();
      toast('Could not create the Google Doc');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }} data-testid="note-editor" data-note-id={noteId}>
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {compact && (
            <IconButton aria-label="Back to notes" onClick={() => ui.openNote(null)} edge="start" data-testid="editor-back">
              <ArrowBackOutlined />
            </IconButton>
          )}
          <InputBase
            value={title}
            onChange={(e) => saveTitle(e.target.value)}
            placeholder="Untitled note"
            fullWidth
            multiline
            maxRows={3}
            data-testid="note-title"
            inputProps={{ 'aria-label': 'Note title', 'data-title': 'true' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                e.preventDefault();
                editor.commands.focus('start');
              }
            }}
            sx={{ typography: 'h5', fontWeight: 500 }}
          />
          <Tooltip title={note.pinned ? 'Unpin' : 'Pin'}>
            <IconButton aria-label={note.pinned ? 'Unpin note' : 'Pin note'} aria-pressed={note.pinned} onClick={() => togglePin(noteId)} color={note.pinned ? 'primary' : 'default'} data-testid="editor-pin">
              <PushPinOutlined />
            </IconButton>
          </Tooltip>
          <Tooltip title="More">
            <IconButton aria-label="More note actions" aria-haspopup="menu" onClick={(e) => setMoreAnchor(e.currentTarget)} data-testid="note-more">
              <MoreVertOutlined />
            </IconButton>
          </Tooltip>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, my: 1 }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={note.categoryId && doc.categories[note.categoryId] ? note.categoryId : ''}
              displayEmpty
              onChange={(e) => updateNote(noteId, { categoryId: (e.target.value as string) || null }, { content: false })}
              inputProps={{ 'aria-label': 'Category', 'data-testid': 'note-category' }}
              sx={{ borderRadius: 2 }}
              renderValue={(v) => {
                const c = v ? doc.categories[v as string] : null;
                return (
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c?.color ?? 'text.disabled' }} />
                    <span>{c?.name ?? 'Other'}</span>
                  </Stack>
                );
              }}
            >
              {cats.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color, mr: 1.5 }} />
                  {c.name}
                </MenuItem>
              ))}
              <MenuItem value="">Other</MenuItem>
            </Select>
          </FormControl>
          {note.tags.map((t) => (
            <Chip key={t} label={`#${t}`} size="small" onDelete={() => useNotes.getState().toggleNoteTag(noteId, t)} data-testid="note-tag" />
          ))}
          <Chip icon={<AddOutlined />} label="Tag" size="small" variant="outlined" onClick={() => setTagsOpen(true)} data-testid="add-tag" />
        </Stack>
      </Box>
      <Toolbar editor={editor} compact={compact} ctx={{ pickImage: () => fileInput.current?.click(), openLink: () => openLinkEditor(editor, setLink) }} />
      <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 3 }, py: 2 }} onClick={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
        <Box sx={editorContentSx}>
          <EditorContent editor={editor} />
        </Box>
      </Box>
      <Stack direction="row" spacing={2} sx={{ px: { xs: 2, sm: 3 }, py: 1, borderTop: 1, borderColor: 'divider', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }} data-testid="word-count">
          {stats.words} {stats.words === 1 ? 'word' : 'words'} · {stats.chars} chars
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Edited {new Date(note.editedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </Typography>
      </Stack>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="image-input"
        onChange={(e) => {
          void insertImages(editor, Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <LinkUi editor={editor} state={link} set={setLink} />
      <TableMenu editor={editor} anchor={tableMenu} onClose={() => setTableMenu(null)} />
      <NoteTagsDialog open={tagsOpen} noteId={noteId} onClose={() => setTagsOpen(false)} />
      <Menu anchorEl={moreAnchor} open={!!moreAnchor} onClose={() => setMoreAnchor(null)}>
        <MenuItem onClick={() => { setMoreAnchor(null); toggleArchive(noteId); }}>
          <ListItemIcon>{note.archived ? <UnarchiveOutlined /> : <ArchiveOutlined />}</ListItemIcon>
          <ListItemText>{note.archived ? 'Unarchive note' : 'Archive note'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setMoreAnchor(null); flush(); const [f] = exportMarkdown([useNotes.getState().doc.notes[noteId]!]); downloadText(f!.name, f!.text, 'text/markdown'); }}>
          <ListItemIcon><DownloadOutlined /></ListItemIcon>
          <ListItemText>Export as Markdown</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => void sendToDoc()} data-testid="send-to-doc">
          <ListItemIcon><DescriptionOutlined /></ListItemIcon>
          <ListItemText>Send to Google Doc</ListItemText>
        </MenuItem>
        {services.filter((s) => s.noteMenuItems && connected.includes(s.id)).map((s) => {
          const Items = s.noteMenuItems!;
          return <Items key={s.id} noteId={noteId} close={() => setMoreAnchor(null)} />;
        })}
        <Divider />
        <MenuItem onClick={() => { setMoreAnchor(null); trashNote(noteId); }} sx={{ color: 'error.main' }} data-testid="delete-note">
          <ListItemIcon sx={{ color: 'inherit' }}><DeleteOutlined /></ListItemIcon>
          <ListItemText>Delete note</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
