import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddOutlined from '@mui/icons-material/AddOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import { useState } from 'react';
import { allTags } from '../../data/model.ts';
import { useNotes } from '../../store/notes.ts';

/** Search-or-create tags for one note. Enter toggles an exact match or creates the tag. */
export function NoteTagsDialog({ open, noteId, onClose }: { open: boolean; noteId: string; onClose(): void }) {
  const doc = useNotes((s) => s.doc);
  const toggle = useNotes((s) => s.toggleNoteTag);
  const [q, setQ] = useState('');
  const note = doc.notes[noteId];
  if (!note) return null;
  const query = q.trim().replace(/^#+/, '').slice(0, 30);
  const tags = allTags(doc);
  const shown = tags.filter((t) => t.toLowerCase().includes(query.toLowerCase()));
  const exact = tags.find((t) => t.toLowerCase() === query.toLowerCase());
  const submit = () => {
    if (!query) return;
    toggle(noteId, exact ?? query);
    setQ('');
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="tags-title">
      <DialogTitle id="tags-title">Tags</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Search or create a tag…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          slotProps={{ htmlInput: { maxLength: 31, 'aria-label': 'Search or create a tag', 'data-testid': 'tag-input' } }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {note.tags.length} on this note · {tags.length} total
        </Typography>
        <List dense component="div" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {query && !exact && (
            <ListItemButton onClick={submit}>
              <ListItemIcon><AddOutlined /></ListItemIcon>
              <ListItemText primary={`Create #${query}`} />
            </ListItemButton>
          )}
          {shown.map((t) => {
            const on = note.tags.includes(t);
            return (
              <ListItemButton key={t} onClick={() => toggle(noteId, t)} selected={on} aria-pressed={on}>
                <ListItemIcon>{on ? <CheckOutlined /> : null}</ListItemIcon>
                <ListItemText primary={`#${t}`} />
              </ListItemButton>
            );
          })}
          {!tags.length && !query && <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No tags yet — type a name above to create one.</Typography>}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
