import Alert from '@mui/material/Alert';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import NotesOutlined from '@mui/icons-material/NotesOutlined';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useEffect, type ReactNode } from 'react';
import { newNote } from '../app/actions.tsx';
import { reconnectGoogle, syncNow } from '../app/session.ts';
import { AccountDialogs } from '../components/dialogs/index.tsx';
import { ConfirmHost } from '../components/dialogs/confirm.tsx';
import { NotesList } from '../components/NotesList.tsx';
import { Sidebar } from '../components/Sidebar.tsx';
import { TopBar } from '../components/TopBar.tsx';
import { TrashView } from '../components/TrashView.tsx';
import { NoteEditor } from '../editor/NoteEditor.tsx';
import { navDestinations, services } from '../services/index.ts';
import { useNotes } from '../store/notes.ts';
import { toast, useUi } from '../store/ui.ts';
import { brand } from '../brand/brand.config.ts';

const DRAWER_WIDTH = 288;
const LIST_WIDTH = 360;

function EmptyEditor() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', p: 4, textAlign: 'center' }} data-testid="editor-empty">
      <Box>
        <Typography variant="h5" component="h2" gutterBottom>A little space for your thoughts.</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Select a note, or start with a fresh page.</Typography>
        <Button variant="contained" startIcon={<EditOutlined />} onClick={() => newNote()}>Create a note</Button>
      </Box>
    </Box>
  );
}

function ReconnectBanner() {
  const needs = useUi((s) => s.needsReconnect);
  if (!needs) return null;
  return (
    <Alert severity="warning" sx={{ borderRadius: 0 }} action={<Button color="inherit" size="small" onClick={() => void reconnectGoogle()} data-testid="reconnect">Reconnect Google</Button>}>
      Your Google connection needs renewing. Edits are saved on this device and will sync after you reconnect.
    </Alert>
  );
}

/** Medium window class: navigation rail. */
function Rail({ onMenu, items }: { onMenu(): void; items: { id: string; label: string; icon: ReactNode }[] }) {
  const view = useUi((s) => s.view);
  const set = useUi((s) => s.set);
  return (
    <Box component="nav" aria-label="Rail" sx={{ width: 80, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 1.5, bgcolor: 'm3.surfaceContainerLow' }}>
      <IconButton aria-label="Open navigation" onClick={onMenu}><MenuOutlined /></IconButton>
      <Tooltip title="New note (Ctrl+N)" placement="right">
        <Fab size="medium" aria-label="New note" onClick={() => newNote()} data-testid="new-note-rail"><EditOutlined /></Fab>
      </Tooltip>
      {items.map((it) => (
        <Stack key={it.id} sx={{ alignItems: 'center' }}>
          <IconButton
            aria-label={it.label}
            aria-current={view === it.id ? 'page' : undefined}
            onClick={() => set({ view: it.id, mobilePane: 'list' })}
            sx={{ width: 56, height: 32, borderRadius: 4, bgcolor: view === it.id ? 'm3.secondaryContainer' : undefined }}
          >
            {it.icon}
          </IconButton>
          <Typography variant="overline" sx={{ lineHeight: 1.6 }}>{it.label}</Typography>
        </Stack>
      ))}
    </Box>
  );
}

export default function Workspace() {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const expanded = useMediaQuery(theme.breakpoints.up('md'));
  const ui = useUi();
  const loaded = useNotes((s) => s.loaded);
  const notes = useNotes((s) => s.doc.notes);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const connected = ui.me?.services ?? [];
  const navs = navDestinations(services, connected);
  const destinations = [
    { id: 'notes', label: 'All notes', icon: <NotesOutlined /> },
    ...navs.map((d) => ({ id: d.id, label: d.label, icon: <d.icon /> })),
    { id: 'trash', label: 'Deleted', icon: <DeleteOutlined /> },
  ];

  useEffect(() => {
    document.title = brand.appName;
    const deep = new URLSearchParams(location.search).get('note');
    if (deep) ui.openNote(deep);
    const onKey = (e: KeyboardEvent) => {
      const m = e.ctrlKey || e.metaKey;
      if (m && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        newNote();
      } else if (m && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        syncNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A deep-linked note that doesn't exist (after load) closes quietly.
  useEffect(() => {
    if (loaded && ui.selectedNoteId && !notes[ui.selectedNoteId]) ui.openNote(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, ui.selectedNoteId, notes]);

  const onDragEnd = (e: DragEndEvent) => {
    const a = String(e.active.id);
    const o = e.over ? String(e.over.id) : '';
    if (a.startsWith('note:') && o.startsWith('cat:')) {
      const id = a.slice(5);
      const cat = o.slice(4);
      useNotes.getState().updateNote(id, { categoryId: cat }, { content: false });
      toast(`Moved to ${useNotes.getState().doc.categories[cat]?.name ?? 'category'}`);
    }
  };

  const selected = ui.selectedNoteId && notes[ui.selectedNoteId] && !notes[ui.selectedNoteId]!.trashedAt ? ui.selectedNoteId : null;
  const nav = navs.find((d) => d.id === ui.view);
  const editor = selected ? <NoteEditor key={selected} noteId={selected} compact={compact} /> : <EmptyEditor />;

  let main: ReactNode;
  if (ui.view === 'trash') main = <TrashView />;
  else if (nav) main = <nav.component />;
  else if (compact) main = ui.mobilePane === 'editor' && selected ? editor : <NotesList />;
  else
    main = (
      <Box sx={{ display: 'flex', height: '100%', minHeight: 0 }}>
        <Box sx={{ width: { sm: 300, md: LIST_WIDTH }, flexShrink: 0, borderRight: 1, borderColor: 'divider', minHeight: 0 }}>
          <NotesList />
        </Box>
        <Box component="main" sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>{editor}</Box>
      </Box>
    );

  const drawer = <Sidebar onNavigate={() => ui.set({ drawerOpen: false })} />;
  const editingOnPhone = compact && ui.mobilePane === 'editor' && !!selected && ui.view === 'notes';

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <Box sx={{ display: 'flex', height: '100dvh', overflow: 'hidden', bgcolor: 'background.default' }} data-window-class={compact ? 'compact' : expanded ? 'expanded' : 'medium'}>
        {expanded && (
          <Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, position: 'relative' } }}>
            {drawer}
          </Drawer>
        )}
        {!expanded && !compact && <Rail onMenu={() => ui.set({ drawerOpen: true })} items={destinations} />}
        {!expanded && (
          <Drawer open={ui.drawerOpen} onClose={() => ui.set({ drawerOpen: false })} sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, borderRadius: '0 16px 16px 0' } }} data-testid="nav-drawer">
            {drawer}
          </Drawer>
        )}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {!editingOnPhone && <TopBar compact={compact} onMenu={compact ? () => ui.set({ drawerOpen: true }) : undefined} />}
          <ReconnectBanner />
          <Box sx={{ flex: 1, minHeight: 0 }}>{main}</Box>
          {compact && !editingOnPhone && (
            <Paper elevation={0} square sx={{ flexShrink: 0 }}>
              <BottomNavigation showLabels value={ui.view} onChange={(_, v: string) => (v === 'menu' ? ui.set({ drawerOpen: true }) : ui.set({ view: v, mobilePane: 'list' }))}>
                {destinations.map((d) => <BottomNavigationAction key={d.id} value={d.id} label={d.label} icon={d.icon} />)}
              </BottomNavigation>
            </Paper>
          )}
        </Box>
        {compact && !editingOnPhone && ui.view === 'notes' && (
          <Fab aria-label="New note" onClick={() => newNote()} sx={{ position: 'fixed', right: 16, bottom: 96 }} data-testid="new-note-fab">
            <EditOutlined />
          </Fab>
        )}
      </Box>
      <AccountDialogs />
      <ConfirmHost />
    </DndContext>
  );
}
