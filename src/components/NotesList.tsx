import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { TransitionGroup } from 'react-transition-group';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import ClearOutlined from '@mui/icons-material/ClearOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import PushPinOutlined from '@mui/icons-material/PushPinOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import SortOutlined from '@mui/icons-material/SortOutlined';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import { useDraggable } from '@dnd-kit/core';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { newNote, toggleArchive, togglePin, trashNote } from '../app/actions.tsx';
import { filterNotes, noteText, shortDate } from '../data/selectors.ts';
import type { Note } from '../data/model.ts';
import { useNotes } from '../store/notes.ts';
import { useUi } from '../store/ui.ts';

/** Animation timing: fade then slide; snap (0 ms) on rapid changes and reduced motion. */
function useListTimeout() {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const last = useRef(0);
  const [timeout, setT] = useState(200);
  return {
    timeout: reduced ? 0 : timeout,
    bump() {
      const now = Date.now();
      setT(now - last.current < 400 ? 0 : 200);
      last.current = now;
    },
  };
}

const NoteCard = memo(function NoteCard({ n, selected, catName, catColor, onMenu }: { n: Note; selected: boolean; catName: string; catColor?: string; onMenu(e: React.MouseEvent<HTMLElement>, n: Note): void }) {
  const openNote = useUi((s) => s.openNote);
  // Drag (pointer only) is on the non-interactive wrapper; the card button and pin button are siblings (no nesting).
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: `note:${n.id}` });
  const preview = noteText(n).slice(0, 120);
  return (
    <Box
      ref={setNodeRef}
      {...listeners}
      role="listitem"
      data-testid="note-card"
      data-note-id={n.id}
      onContextMenu={(e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        onMenu(e, n);
      }}
      sx={{ position: 'relative', mb: 0.5, opacity: isDragging ? 0.5 : n.archived ? 0.6 : 1, '&:hover .pin-btn, &:focus-within .pin-btn': { opacity: 1 } }}
    >
    <ListItemButton
      selected={selected}
      aria-current={selected ? 'true' : undefined}
      onClick={() => openNote(n.id)}
      sx={{ borderRadius: 3, alignItems: 'flex-start', py: 1.25, pr: 6 }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
          <Typography variant="subtitle1" noWrap sx={{ flex: 1 }} data-testid="note-card-title">
            {n.title || 'Untitled note'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            {shortDate(n.editedAt)}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {preview || 'No content'}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', alignItems: 'center', rowGap: 0.5 }}>
          <Typography variant="overline" sx={{ color: catColor ?? 'text.secondary' }}>
            {catName}
          </Typography>
          {n.archived && <Chip size="small" label="Archived" variant="outlined" />}
          {n.tags.slice(0, 3).map((t) => (
            <Typography key={t} variant="overline" color="text.secondary">
              #{t}
            </Typography>
          ))}
        </Stack>
      </Box>
    </ListItemButton>
      <Tooltip title={n.pinned ? 'Unpin' : 'Pin'}>
        <IconButton
          className="pin-btn"
          size="small"
          aria-label={n.pinned ? 'Unpin' : 'Pin'}
          aria-pressed={n.pinned}
          onClick={(e) => {
            e.stopPropagation();
            togglePin(n.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          sx={{ position: 'absolute', right: 8, top: 8, opacity: n.pinned ? 1 : 0, color: n.pinned ? 'primary.main' : undefined }}
        >
          <PushPinOutlined fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
});

export function NotesList() {
  const doc = useNotes((s) => s.doc);
  const loaded = useNotes((s) => s.loaded);
  const setPrefs = useNotes((s) => s.setPrefs);
  const ui = useUi();
  const [q, setQ] = useState(ui.search);
  const [menu, setMenu] = useState<{ el: HTMLElement; n: Note } | null>(null);
  const anim = useListTimeout();
  useEffect(() => {
    const t = setTimeout(() => ui.set({ search: q }), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const sort = doc.prefs.sort;
  const { pinned, others } = useMemo(
    () => filterNotes(doc, { category: ui.filterCategory, tags: ui.filterTags, search: ui.search, showArchived: ui.showArchived, sort }),
    [doc, ui.filterCategory, ui.filterTags, ui.search, ui.showArchived, sort],
  );
  const ids = [...pinned, ...others].map((n) => n.id).join(',');
  const prevIds = useRef(ids);
  useEffect(() => {
    if (prevIds.current !== ids) anim.bump();
    prevIds.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const title = ui.filterCategory === 'uncategorized' ? 'Other' : ui.filterCategory ? doc.categories[ui.filterCategory]?.name ?? 'All notes' : 'All notes';
  const card = (n: Note) => {
    const c = n.categoryId ? doc.categories[n.categoryId] : undefined;
    return (
      <Collapse key={n.id} timeout={anim.timeout}>
        <NoteCard n={n} selected={ui.selectedNoteId === n.id} catName={c?.name ?? 'Other'} catColor={c?.color} onMenu={(e, note) => setMenu({ el: e.currentTarget, n: note })} />
      </Collapse>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }} data-testid="notes-list">
      <Box sx={{ p: 2, pb: 1 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search notes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': 'Search notes', 'data-testid': 'search' },
            input: {
              sx: { borderRadius: 7, bgcolor: 'm3.surfaceContainerHigh' },
              startAdornment: <InputAdornment position="start"><SearchOutlined /></InputAdornment>,
              endAdornment: q ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" onClick={() => setQ('')}><ClearOutlined fontSize="small" /></IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: 'center' }}>
          <Typography variant="subtitle1" component="h2" noWrap sx={{ flex: 1 }} data-testid="list-title">
            {title}
          </Typography>
          <Tooltip title={`Sorted by ${sort === 'created' ? 'date created' : 'last updated'}`}>
            <Button size="small" startIcon={<SortOutlined />} onClick={() => setPrefs({ sort: sort === 'created' ? 'updated' : 'created' })} data-testid="sort-toggle">
              {sort === 'created' ? 'Created' : 'Updated'}
            </Button>
          </Tooltip>
          <Tooltip title={ui.showArchived ? 'Hide archived notes' : 'Show archived notes'}>
            <ToggleButton
              value="archived"
              size="small"
              selected={ui.showArchived}
              onChange={() => ui.set({ showArchived: !ui.showArchived })}
              aria-label={ui.showArchived ? 'Hide archived notes' : 'Show archived notes'}
              sx={{ border: 0, borderRadius: 5 }}
            >
              <Inventory2Outlined fontSize="small" />
            </ToggleButton>
          </Tooltip>
        </Stack>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 12 }}>
        {loaded && !pinned.length && !others.length && (
          <Box sx={{ textAlign: 'center', py: 6, px: 2 }} data-testid="list-empty">
            <Typography variant="body1" color="text.secondary">{ui.search ? 'No notes match your search.' : 'No notes here yet.'}</Typography>
            {!ui.search && <Button sx={{ mt: 1 }} onClick={() => newNote()}>Create a note</Button>}
          </Box>
        )}
        <Box component="section" aria-label="Note list">
          {pinned.length > 0 && (
            <>
              <ListSubheader component="h3" sx={{ bgcolor: 'transparent', position: 'static', lineHeight: 2.5 }}>Pinned</ListSubheader>
              <Box role="list" aria-label="Pinned notes"><TransitionGroup component={null}>{pinned.map(card)}</TransitionGroup></Box>
            </>
          )}
          {pinned.length > 0 && others.length > 0 && <ListSubheader component="h3" sx={{ bgcolor: 'transparent', position: 'static', lineHeight: 2.5 }}>Other notes</ListSubheader>}
          <Box role="list" aria-label="Notes in this view"><TransitionGroup component={null}>{others.map(card)}</TransitionGroup></Box>
        </Box>
      </Box>
      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { togglePin(menu!.n.id); setMenu(null); }}>
          <ListItemIcon><PushPinOutlined /></ListItemIcon>
          <ListItemText>{menu?.n.pinned ? 'Unpin' : 'Pin'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { toggleArchive(menu!.n.id); setMenu(null); }}>
          <ListItemIcon>{menu?.n.archived ? <UnarchiveOutlined /> : <ArchiveOutlined />}</ListItemIcon>
          <ListItemText>{menu?.n.archived ? 'Unarchive note' : 'Archive note'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { trashNote(menu!.n.id); setMenu(null); }}>
          <ListItemIcon><DeleteOutlined /></ListItemIcon>
          <ListItemText>Delete note</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
