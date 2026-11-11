import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddOutlined from '@mui/icons-material/AddOutlined';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import CircleOutlined from '@mui/icons-material/CircleOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import NotesOutlined from '@mui/icons-material/NotesOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import { useDroppable } from '@dnd-kit/core';
import { useMemo, useState, type ReactNode } from 'react';
import { archiveCategory, deleteCategory, newNote, unarchiveCategory } from '../app/actions.tsx';
import { activeCategories, categoryCounts, stats, tagCounts } from '../data/selectors.ts';
import type { Category } from '../data/model.ts';
import { navDestinations, services, sidebarPanels } from '../services/index.ts';
import { useNotes } from '../store/notes.ts';
import { useUi } from '../store/ui.ts';

function Section({
  id, title, count, expanded, onToggle, active, actions, children,
}: {
  id: string; title: string; count: number; expanded: boolean; onToggle(v: boolean): void; active?: string | null; actions: ReactNode; children: ReactNode;
}) {
  return (
    <Accordion expanded={expanded} onChange={(_, v) => onToggle(v)} slotProps={{ transition: { unmountOnExit: false } }} data-testid={`sidebar-${id}`}>
      <Box sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
        <AccordionSummary
          expandIcon={<ExpandMoreOutlined />}
          aria-controls={`${id}-content`}
          id={`${id}-header`}
          sx={{ flex: 1, minHeight: 48, px: 2, '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1, my: 0, minWidth: 0 } }}
        >
          <Typography variant="subtitle2" component="h2">
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary" aria-label={`${count} items`}>
            {count}
          </Typography>
          {!expanded && active && <Chip size="small" label={active} color="secondary" sx={{ maxWidth: 120 }} data-testid={`${id}-active-filter`} />}
        </AccordionSummary>
        {actions}
      </Box>
      <AccordionDetails id={`${id}-content`} sx={{ px: 1, pt: 0, pb: 1 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}

function CategoryItem({ c, count, selected, onSelect, onMenu }: { c: Category; count: number; selected: boolean; onSelect(): void; onMenu(e: React.MouseEvent<HTMLElement>): void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cat:${c.id}` });
  return (
    <ListItemButton
      ref={setNodeRef}
      selected={selected}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e);
      }}
      sx={{ minHeight: 40, outline: isOver ? 2 : 0, outlineStyle: 'solid', outlineColor: 'primary.main', opacity: c.archived ? 0.6 : 1 }}
      data-testid={`category-${c.name}`}
    >
      <ListItemIcon sx={{ minWidth: 32 }}>
        <Box component="span" sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: c.color }} aria-hidden />
      </ListItemIcon>
      <ListItemText primary={c.name} secondary={c.archived ? 'Archived' : undefined} slotProps={{ primary: { noWrap: true, variant: 'body2' } }} />
      <Typography variant="caption" color="text.secondary">
        {count}
      </Typography>
    </ListItemButton>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const doc = useNotes((s) => s.doc);
  const setPrefs = useNotes((s) => s.setPrefs);
  const ui = useUi();
  const [menu, setMenu] = useState<{ el: HTMLElement; c: Category } | null>(null);
  const counts = useMemo(() => categoryCounts(doc, ui.showArchived), [doc, ui.showArchived]);
  const tags = useMemo(() => tagCounts(doc), [doc]);
  const cats = activeCategories(doc, ui.showArchived);
  const st = useMemo(() => stats(doc), [doc]);
  const connected = ui.me?.services ?? [];
  const navs = navDestinations(services, connected);
  const panels = sidebarPanels(services, connected);
  const trashCount = st.trashed;
  const sb = doc.prefs.sidebar;
  const toggle = (k: keyof typeof sb) => (v: boolean) => setPrefs({ sidebar: { ...sb, [k]: v } });

  const go = (patch: Parameters<typeof ui.set>[0]) => {
    ui.set({ ...patch, mobilePane: 'list' });
    onNavigate?.();
  };
  const activeCat = ui.filterCategory === 'uncategorized' ? 'Other' : ui.filterCategory ? doc.categories[ui.filterCategory]?.name ?? null : null;

  return (
    <Box component="nav" aria-label="Main" sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', pb: 2 }}>
      <Box sx={{ p: 2, pb: 1 }}>
        <Fab variant="extended" onClick={() => { newNote(); onNavigate?.(); }} aria-label="New note (Ctrl+N)" data-testid="new-note">
          <EditOutlined sx={{ mr: 1 }} /> New note
        </Fab>
      </Box>
      <List dense sx={{ px: 1 }}>
        <ListItemButton selected={ui.view === 'notes' && !ui.filterCategory && !ui.filterTags.length} onClick={() => go({ view: 'notes', filterCategory: null, filterTags: [] })}>
          <ListItemIcon><NotesOutlined /></ListItemIcon>
          <ListItemText primary="All notes" />
          <Typography variant="caption" color="text.secondary">{counts.all}</Typography>
        </ListItemButton>
        {navs.map((d) => (
          <ListItemButton key={d.id} selected={ui.view === d.id} onClick={() => go({ view: d.id })} data-testid={`nav-${d.id}`}>
            <ListItemIcon><d.icon /></ListItemIcon>
            <ListItemText primary={d.label} secondary={d.connected ? undefined : 'Not connected'} />
          </ListItemButton>
        ))}
        <ListItemButton selected={ui.view === 'trash'} onClick={() => go({ view: 'trash' })} data-testid="nav-trash">
          <ListItemIcon><DeleteOutlined /></ListItemIcon>
          <ListItemText primary="Recently deleted" />
          {trashCount > 0 && <Typography variant="caption" color="text.secondary">{trashCount}</Typography>}
        </ListItemButton>
      </List>

      <Section
        id="categories"
        title="Categories"
        count={cats.length}
        expanded={sb.categories}
        onToggle={toggle('categories')}
        active={activeCat}
        actions={
          <>
            <Tooltip title="New category">
              <IconButton size="small" aria-label="New category" onClick={() => ui.set({ categoryDialog: { id: null } })}>
                <AddOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Manage categories">
              <IconButton size="small" aria-label="Manage categories" onClick={() => ui.set({ dialog: 'categories' })}>
                <TuneOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        }
      >
        <List dense disablePadding>
          {cats.map((c) => (
            <CategoryItem
              key={c.id}
              c={c}
              count={counts[c.id] ?? 0}
              selected={ui.view === 'notes' && ui.filterCategory === c.id}
              onSelect={() => go({ view: 'notes', filterCategory: c.id, filterTags: [] })}
              onMenu={(e) => setMenu({ el: e.currentTarget, c })}
            />
          ))}
          {(counts.uncategorized ?? 0) > 0 && (
            <ListItemButton selected={ui.filterCategory === 'uncategorized'} onClick={() => go({ view: 'notes', filterCategory: 'uncategorized', filterTags: [] })} sx={{ minHeight: 40 }}>
              <ListItemIcon sx={{ minWidth: 32 }}><CircleOutlined sx={{ fontSize: 12 }} /></ListItemIcon>
              <ListItemText primary="Other" slotProps={{ primary: { variant: 'body2' } }} />
              <Typography variant="caption" color="text.secondary">{counts.uncategorized}</Typography>
            </ListItemButton>
          )}
          {cats.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>No categories yet.</Typography>}
        </List>
      </Section>

      <Section
        id="tags"
        title="Tags"
        count={Object.keys(tags).length}
        expanded={sb.tags}
        onToggle={toggle('tags')}
        active={ui.filterTags.length ? ui.filterTags.map((t) => '#' + t).join(' ') : null}
        actions={
          <Tooltip title="Manage tags">
            <IconButton size="small" aria-label="Manage tags" onClick={() => ui.set({ dialog: 'tagManager' })}>
              <SettingsOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        }
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, px: 1 }} role="group" aria-label="Filter by tag">
          {Object.keys(tags).sort().map((t) => {
            const on = ui.filterTags.includes(t);
            return (
              <Chip
                key={t}
                label={`#${t}`}
                size="small"
                color={on ? 'secondary' : 'default'}
                variant={on ? 'filled' : 'outlined'}
                aria-pressed={on}
                onClick={() => go({ view: 'notes', filterTags: on ? ui.filterTags.filter((x) => x !== t) : [...ui.filterTags, t] })}
              />
            );
          })}
          {Object.keys(tags).length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>No tags yet</Typography>}
        </Box>
      </Section>

      {panels.map((p) => (
        <Section key={p.id} id={p.id} title={p.label} count={0} expanded={sb.today} onToggle={toggle('today')} actions={null}>
          <p.component />
        </Section>
      ))}

      <Box sx={{ mt: 'auto', px: 2, pt: 2 }}>
        <Typography
          component="button"
          variant="caption"
          color="text.secondary"
          onClick={() => ui.set({ dialog: 'stats' })}
          sx={{ background: 'none', border: 0, cursor: 'pointer', p: 0, font: 'inherit', textAlign: 'left' }}
          data-testid="stats-link"
        >
          {st.notes} notes · {st.categories} categories · {st.tags} tags
        </Typography>
      </Box>

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { ui.set({ categoryDialog: { id: menu!.c.id } }); setMenu(null); }}>
          <ListItemIcon><EditOutlined /></ListItemIcon>
          <ListItemText>Edit category</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { const c = menu!.c; setMenu(null); void (c.archived ? unarchiveCategory(c.id) : archiveCategory(c.id)); }}>
          <ListItemIcon>{menu?.c.archived ? <UnarchiveOutlined /> : <ArchiveOutlined />}</ListItemIcon>
          <ListItemText>{menu?.c.archived ? 'Unarchive category' : 'Archive category'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { const c = menu!.c; setMenu(null); void deleteCategory(c.id); }} sx={{ color: 'error.main' }}>
          <ListItemIcon sx={{ color: 'inherit' }}><DeleteOutlined /></ListItemIcon>
          <ListItemText>Delete category</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
