import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteForeverOutlined from '@mui/icons-material/DeleteForeverOutlined';
import RestoreFromTrashOutlined from '@mui/icons-material/RestoreFromTrashOutlined';
import { deleteForever } from '../app/actions.tsx';
import { confirm } from './dialogs/confirm.tsx';
import { TRASH_TTL_MS } from '../data/model.ts';
import { noteText, trashedNotes } from '../data/selectors.ts';
import { useNotes } from '../store/notes.ts';
import { toast } from '../store/ui.ts';

export function TrashView() {
  const doc = useNotes((s) => s.doc);
  const restore = useNotes((s) => s.restoreNote);
  const empty = useNotes((s) => s.emptyTrash);
  const items = trashedNotes(doc);
  const daysLeft = (t: number) => Math.max(0, Math.ceil((t + TRASH_TTL_MS - Date.now()) / 86400000));
  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, overflowY: 'auto', height: '100%' }} data-testid="trash-view">
      <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="h5" component="h2" sx={{ flex: 1 }}>
          Recently deleted
        </Typography>
        {items.length > 0 && (
          <Button
            color="error"
            onClick={async () => {
              if (await confirm('Empty Recently deleted?', `${items.length} note(s) will be permanently deleted. This can’t be undone.`, 'Delete all')) {
                empty();
                toast('Recently deleted emptied');
              }
            }}
          >
            Empty
          </Button>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Notes are deleted forever after 30 days.
      </Typography>
      {items.length === 0 && <Typography color="text.secondary">Nothing here.</Typography>}
      <List>
        {items.map((n) => (
          <ListItem
            key={n.id}
            divider
            data-testid="trash-item"
            secondaryAction={
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="Restore">
                  <IconButton aria-label={`Restore ${n.title || 'Untitled note'}`} onClick={() => { restore(n.id); toast('Note restored'); }}>
                    <RestoreFromTrashOutlined />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete forever">
                  <IconButton aria-label={`Delete ${n.title || 'Untitled note'} forever`} onClick={() => void deleteForever(n.id)}>
                    <DeleteForeverOutlined />
                  </IconButton>
                </Tooltip>
              </Stack>
            }
          >
            <ListItemText
              primary={n.title || 'Untitled note'}
              secondary={`${noteText(n).slice(0, 80) || 'No content'} · ${daysLeft(n.trashedAt!)} days left`}
              sx={{ pr: 10 }}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
