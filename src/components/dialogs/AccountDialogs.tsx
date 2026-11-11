import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import DevicesOutlined from '@mui/icons-material/DevicesOutlined';
import { useEffect, useState } from 'react';
import { wipeLocal } from '../../app/session.ts';
import { api, type DeviceSession } from '../../lib/api.ts';
import { clearLocalHints } from '../../lib/localPrefs.ts';
import { trashNotesFolder } from '../../services/drive/client.ts';
import { toast, useUi } from '../../store/ui.ts';

export function DevicesDialog() {
  const open = useUi((s) => s.dialog === 'devices');
  const set = useUi((s) => s.set);
  const [list, setList] = useState<DeviceSession[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setList(null);
    api.sessions().then(setList, () => setList([]));
  }, [open]);
  const revoke = async (s: DeviceSession) => {
    await api.revokeSession(s.id);
    if (s.current) {
      await wipeLocal();
      location.assign('/');
      return;
    }
    setList((l) => l?.filter((x) => x.id !== s.id) ?? null);
    toast('Device signed out');
  };
  return (
    <Dialog open={open} onClose={() => set({ dialog: null })} fullWidth maxWidth="sm" aria-labelledby="devices-title">
      <DialogTitle id="devices-title">Devices</DialogTitle>
      <DialogContent>
        <DialogContentText>Devices signed in to your account. Signing a device out ends its session.</DialogContentText>
        <List>
          {!list && [0, 1].map((i) => <Skeleton key={i} height={56} />)}
          {list?.map((s) => (
            <ListItem
              key={s.id}
              divider
              data-testid="device-row"
              secondaryAction={<Button color={s.current ? 'primary' : 'error'} onClick={() => void revoke(s)}>{s.current ? 'Sign out' : 'Revoke'}</Button>}
            >
              <ListItemIcon><DevicesOutlined /></ListItemIcon>
              <ListItemText
                primary={`${s.label}${s.current ? ' (this device)' : ''}`}
                secondary={`Last active ${new Date(s.lastSeenAt).toLocaleString()} · Signed in ${new Date(s.createdAt).toLocaleDateString()}`}
                sx={{ pr: 10 }}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions><Button onClick={() => set({ dialog: null })}>Close</Button></DialogActions>
    </Dialog>
  );
}

const CONFIRM_WORD = 'DELETE';

export function DeleteAccountDialog() {
  const open = useUi((s) => s.dialog === 'deleteAccount');
  const set = useUi((s) => s.set);
  const [typed, setTyped] = useState('');
  const [trashDrive, setTrashDrive] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      if (trashDrive) await trashNotesFolder().catch(() => toast('Could not move the Drive folder to trash'));
      await api.deleteAccount();
      await wipeLocal();
      clearLocalHints(true);
      location.assign('/');
    } catch {
      setBusy(false);
      toast('Could not delete your account. Try again.');
    }
  };
  return (
    <Dialog open={open} onClose={() => !busy && set({ dialog: null })} fullWidth maxWidth="xs" aria-labelledby="del-title">
      <DialogTitle id="del-title">Disconnect &amp; delete data</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">
          This will:
          <ul>
            <li>revoke this app’s access to your Google account,</li>
            <li>delete every record our server keeps about you and sign out all devices,</li>
            <li>wipe the data stored in this browser.</li>
          </ul>
        </DialogContentText>
        <FormControlLabel control={<Checkbox checked={trashDrive} onChange={(e) => setTrashDrive(e.target.checked)} />} label="Also move the Notes folder in my Drive to the trash" />
        {!trashDrive && <Alert severity="info" sx={{ my: 1 }}>Your notes stay in your Google Drive.</Alert>}
        <TextField
          fullWidth
          sx={{ mt: 2 }}
          label={`Type ${CONFIRM_WORD} to confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          slotProps={{ htmlInput: { 'data-testid': 'delete-confirm-input', autoComplete: 'off' } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => set({ dialog: null })} disabled={busy}>Cancel</Button>
        <Button color="error" variant="contained" disabled={typed !== CONFIRM_WORD || busy} onClick={() => void run()} data-testid="delete-confirm">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
