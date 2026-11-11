import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined';
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { useState } from 'react';
import { archiveCategory, deleteCategory, deleteTag, unarchiveCategory } from '../../app/actions.tsx';
import { activeCategories, stats, tagCounts } from '../../data/selectors.ts';
import { useNotes } from '../../store/notes.ts';
import { toast, useUi } from '../../store/ui.ts';
import { CATEGORY_COLORS } from '../../theme/tokens.ts';

export function CategoryDialog() {
  const req = useUi((s) => s.categoryDialog);
  const set = useUi((s) => s.set);
  const doc = useNotes((s) => s.doc);
  const existing = req?.id ? doc.categories[req.id] : null;
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[0]!);
  const [forReq, setForReq] = useState<typeof req>(null);
  if (req !== forReq) {
    setForReq(req);
    setName(existing?.name ?? '');
    setColor(existing?.color ?? CATEGORY_COLORS[0]!);
  }
  const close = () => set({ categoryDialog: null });
  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (existing) useNotes.getState().updateCategory(existing.id, { name: n.slice(0, 30), color });
    else useNotes.getState().createCategory(n, color);
    toast('Category saved');
    close();
  };
  return (
    <Dialog open={!!req} onClose={close} fullWidth maxWidth="xs" aria-labelledby="cat-title">
      <DialogTitle id="cat-title">{existing ? 'Edit category' : 'New category'}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label="Category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          slotProps={{ htmlInput: { maxLength: 30, 'data-testid': 'category-name' } }}
          sx={{ mt: 1 }}
        />
        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Colour</Typography>
        <Box role="radiogroup" aria-label="Colour" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {CATEGORY_COLORS.map((c, i) => (
            <Box
              key={c}
              component="button"
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`Colour ${i + 1}`}
              onClick={() => setColor(c)}
              sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: c, border: 2, borderColor: color === c ? 'text.primary' : 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'common.white' }}
            >
              {color === c && <CheckOutlined fontSize="small" />}
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!name.trim()} data-testid="category-save">Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export function CategoriesManager() {
  const open = useUi((s) => s.dialog === 'categories');
  const set = useUi((s) => s.set);
  const doc = useNotes((s) => s.doc);
  const cats = activeCategories(doc, true);
  const total = (id: string) => Object.values(doc.notes).filter((n) => n.categoryId === id && !n.trashedAt).length;
  const move = (i: number, d: number) => {
    const ids = cats.map((c) => c.id);
    const [x] = ids.splice(i, 1);
    ids.splice(i + d, 0, x!);
    useNotes.getState().reorderCategories(ids);
  };
  return (
    <Dialog open={open} onClose={() => set({ dialog: null })} fullWidth maxWidth="sm" aria-labelledby="cats-title">
      <DialogTitle id="cats-title">Categories</DialogTitle>
      <DialogContent>
        {!cats.length && <Typography color="text.secondary">No categories yet.</Typography>}
        <List>
          {cats.map((c, i) => (
            <ListItem key={c.id} divider disableGutters data-testid={`manage-cat-${c.name}`}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: c.color, mr: 2, flexShrink: 0 }} />
              <ListItemText primary={c.name} secondary={`${total(c.id)} notes${c.archived ? ' · Archived' : ''}`} />
              <Stack direction="row" sx={{ alignItems: 'center' }}>
                <Tooltip title="Move up"><span><IconButton size="small" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardOutlined fontSize="small" /></IconButton></span></Tooltip>
                <Tooltip title="Move down"><span><IconButton size="small" aria-label={`Move ${c.name} down`} disabled={i === cats.length - 1} onClick={() => move(i, 1)}><ArrowDownwardOutlined fontSize="small" /></IconButton></span></Tooltip>
                <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit ${c.name}`} onClick={() => set({ categoryDialog: { id: c.id } })}><EditOutlined fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Delete"><IconButton size="small" aria-label={`Delete ${c.name}`} onClick={() => void deleteCategory(c.id)}><DeleteOutlined fontSize="small" /></IconButton></Tooltip>
                <Tooltip title={c.archived ? 'Archived' : 'Active'}>
                  <Switch
                    checked={!c.archived}
                    onChange={() => void (c.archived ? unarchiveCategory(c.id) : archiveCategory(c.id))}
                    slotProps={{ input: { 'aria-label': `${c.name} active` } }}
                  />
                </Tooltip>
              </Stack>
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => set({ categoryDialog: { id: null } })}>New category</Button>
        <Button variant="contained" onClick={() => set({ dialog: null })}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}

export function TagManagerDialog() {
  const open = useUi((s) => s.dialog === 'tagManager');
  const set = useUi((s) => s.set);
  const doc = useNotes((s) => s.doc);
  const counts = tagCounts(doc);
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null);
  const [newTag, setNewTag] = useState('');
  const names = Object.keys(counts).sort();
  return (
    <Dialog open={open} onClose={() => set({ dialog: null })} fullWidth maxWidth="xs" aria-labelledby="tagman-title">
      <DialogTitle id="tagman-title">Manage tags</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <TextField size="small" fullWidth label="New tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} slotProps={{ htmlInput: { maxLength: 30 } }}
            onKeyDown={(e) => { if (e.key === 'Enter' && newTag.trim()) { useNotes.getState().createTag(newTag); setNewTag(''); } }} />
          <Button onClick={() => { if (newTag.trim()) { useNotes.getState().createTag(newTag); setNewTag(''); } }}>Add</Button>
        </Stack>
        <List dense>
          {names.map((t) => (
            <ListItem key={t} divider disableGutters
              secondaryAction={editing?.from === t ? (
                <Button size="small" onClick={() => { useNotes.getState().renameTag(t, editing.to); setEditing(null); toast('Tag renamed'); }}>Save</Button>
              ) : (
                <Stack direction="row">
                  <IconButton size="small" aria-label={`Rename #${t}`} onClick={() => setEditing({ from: t, to: t })}><EditOutlined fontSize="small" /></IconButton>
                  <IconButton size="small" aria-label={`Delete #${t}`} onClick={() => void deleteTag(t)}><DeleteOutlined fontSize="small" /></IconButton>
                </Stack>
              )}
            >
              {editing?.from === t ? (
                <TextField size="small" autoFocus value={editing.to} onChange={(e) => setEditing({ from: t, to: e.target.value })} slotProps={{ htmlInput: { maxLength: 30, 'aria-label': 'Tag name' } }} sx={{ mr: 8 }} />
              ) : (
                <ListItemText primary={`#${t}`} secondary={`${counts[t]} notes`} />
              )}
            </ListItem>
          ))}
          {!names.length && <ListItem disableGutters><ListItemText secondary="No tags yet." /></ListItem>}
        </List>
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={() => set({ dialog: null })}>Done</Button></DialogActions>
    </Dialog>
  );
}

export function StatsDialog() {
  const open = useUi((s) => s.dialog === 'stats');
  const set = useUi((s) => s.set);
  const doc = useNotes((s) => s.doc);
  const s = stats(doc);
  const rows: [string, number][] = [['Active notes', s.notes], ['Pinned', s.pinned], ['Archived', s.archived], ['Categories', s.categories], ['Tags', s.tags], ['Words', s.words], ['Recently deleted', s.trashed]];
  return (
    <Dialog open={open} onClose={() => set({ dialog: null })} fullWidth maxWidth="xs" aria-labelledby="stats-title">
      <DialogTitle id="stats-title">Stats</DialogTitle>
      <DialogContent>
        <List dense>
          {rows.map(([k, v]) => (
            <ListItem key={k} divider disableGutters secondaryAction={<Typography variant="subtitle2">{v.toLocaleString()}</Typography>}>
              <ListItemText primary={k} />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions><Button onClick={() => set({ dialog: null })}>Close</Button></DialogActions>
    </Dialog>
  );
}
