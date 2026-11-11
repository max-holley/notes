import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Radio from '@mui/material/Radio';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useColorScheme, useTheme } from '@mui/material/styles';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import SettingsBrightnessOutlined from '@mui/icons-material/SettingsBrightnessOutlined';
import { useRef, useState, type ReactNode } from 'react';
import { connectService, refreshMe } from '../../app/session.ts';
import { exportJson, exportMarkdown, importFiles, planImport } from '../../data/importExport.ts';
import type { ThemeMode } from '../../data/model.ts';
import { api } from '../../lib/api.ts';
import { downloadText } from '../../lib/download.ts';
import { LS, setLocal } from '../../lib/localPrefs.ts';
import { services } from '../../services/index.ts';
import { useNotes } from '../../store/notes.ts';
import { toast, useUi } from '../../store/ui.ts';
import { applyFont } from '../../theme/ThemeRoot.tsx';
import { ACCENTS, FONTS, MONO_STACK } from '../../theme/tokens.ts';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ mb: 3 }}>
      <Typography variant="subtitle2" component="h3" color="primary" sx={{ mb: 1 }}>{title}</Typography>
      {children}
    </Box>
  );
}

export function SettingsDialog() {
  const open = useUi((s) => s.dialog === 'settings');
  const me = useUi((s) => s.me);
  const set = useUi((s) => s.set);
  const prefs = useNotes((s) => s.doc.prefs);
  const setPrefs = useNotes((s) => s.setPrefs);
  const { setMode } = useColorScheme();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const font = FONTS.find((f) => f.id === prefs.font) ?? FONTS[0];
  const connected = me?.services ?? [];
  const setTheme = (t: ThemeMode) => {
    setMode(t);
    setPrefs({ theme: t });
  };
  const disconnect = async (id: string) => {
    await api.disconnect(id);
    await refreshMe();
    toast('Disconnected');
  };
  return (
    <Dialog open={open} onClose={() => set({ dialog: null })} fullWidth maxWidth="sm" fullScreen={fullScreen} aria-labelledby="settings-title">
      <DialogTitle id="settings-title">Settings</DialogTitle>
      <DialogContent dividers>
        <Group title="Appearance">
          <ToggleButtonGroup exclusive value={prefs.theme} onChange={(_, v: ThemeMode | null) => v && setTheme(v)} aria-label="Theme" size="small">
            <ToggleButton value="system" aria-label="Auto"><SettingsBrightnessOutlined fontSize="small" sx={{ mr: 1 }} />Auto</ToggleButton>
            <ToggleButton value="light" aria-label="Light"><LightModeOutlined fontSize="small" sx={{ mr: 1 }} />Light</ToggleButton>
            <ToggleButton value="dark" aria-label="Dark"><DarkModeOutlined fontSize="small" sx={{ mr: 1 }} />Dark</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="body2" sx={{ mt: 2, mb: 1 }}>Accent colour</Typography>
          <Box role="radiogroup" aria-label="Accent colour" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {ACCENTS.map((a) => (
              <Tooltip key={a.id} title={a.label}>
                <Box
                  component="button"
                  type="button"
                  role="radio"
                  aria-checked={prefs.accent === a.id}
                  aria-label={a.label}
                  onClick={() => setPrefs({ accent: a.id })}
                  sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: a.seed, border: 2, borderColor: prefs.accent === a.id ? 'text.primary' : 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'common.white' }}
                >
                  {prefs.accent === a.id && <CheckOutlined fontSize="small" />}
                </Box>
              </Tooltip>
            ))}
          </Box>
          <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <Button variant="outlined" onClick={() => set({ dialog: 'font' })} data-testid="open-font">Font: {font.label}</Button>
            <Button variant="outlined" onClick={() => set({ dialog: 'toolbar' })} data-testid="open-toolbar">Customise toolbar</Button>
          </Stack>
        </Group>
        <Divider sx={{ mb: 2 }} />
        <Group title="Google services">
          <List disablePadding>
            {services.map((s) => {
              const on = connected.includes(s.id);
              const Panel = s.settingsPanel;
              return (
                <Box key={s.id} data-testid={`service-${s.id}`}>
                  <ListItem disableGutters secondaryAction={
                    s.required ? <Chip size="small" label={on ? 'Connected' : 'Not connected'} color={on ? 'default' : 'warning'} />
                      : on ? <Button size="small" onClick={() => void disconnect(s.id)}>Disconnect</Button>
                      : <Button size="small" variant="contained" onClick={() => void connectService(s.id)} data-testid={`connect-${s.id}`}>Connect</Button>
                  }>
                    <ListItemIcon><s.icon /></ListItemIcon>
                    <ListItemText primary={s.label} secondary={s.description} sx={{ pr: 12 }} />
                  </ListItem>
                  {Panel && on && <Box sx={{ pl: 7, pb: 1 }}><Panel connected={on} /></Box>}
                </Box>
              );
            })}
          </List>
        </Group>
        <Divider sx={{ mb: 2 }} />
        <Group title="Your notes">
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Button variant="outlined" onClick={() => set({ dialog: 'importExport' })} data-testid="open-import-export">Import / export</Button>
            <Button variant="outlined" onClick={() => set({ dialog: 'stats' })}>Stats</Button>
            <Button variant="outlined" onClick={() => set({ dialog: 'devices' })}>Devices</Button>
          </Stack>
        </Group>
        <Group title="About">
          <Link href="/privacy" target="_blank" rel="noopener">Privacy policy</Link>
        </Group>
      </DialogContent>
      <DialogActions><Button onClick={() => set({ dialog: null })}>Done</Button></DialogActions>
    </Dialog>
  );
}

/** Font picker with live app-wide preview; Save persists, Cancel/Escape reverts. */
export function FontDialog() {
  const open = useUi((s) => s.dialog === 'font');
  const set = useUi((s) => s.set);
  const current = useNotes((s) => s.doc.prefs.font);
  const setPrefs = useNotes((s) => s.setPrefs);
  const [choice, setChoice] = useState(current);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChoice(current);
  }
  const pick = (id: string) => {
    setChoice(id);
    applyFont(id);
  };
  const cancel = () => {
    applyFont(current);
    set({ dialog: 'settings' });
  };
  const save = () => {
    setPrefs({ font: choice });
    setLocal(LS.font, choice);
    applyFont(choice);
    set({ dialog: 'settings' });
    toast('Font saved');
  };
  return (
    <Dialog open={open} onClose={cancel} fullWidth maxWidth="xs" aria-labelledby="font-title">
      <DialogTitle id="font-title">Font</DialogTitle>
      <DialogContent>
        <DialogContentText>Applies to the whole app and your notes. Code stays monospace.</DialogContentText>
        <List role="radiogroup" aria-label="Font">
          {FONTS.map((f) => (
            <ListItemButton key={f.id} role="radio" aria-checked={choice === f.id} selected={choice === f.id} onClick={() => pick(f.id)} data-testid={`font-${f.id}`}>
              <ListItemIcon><Radio checked={choice === f.id} tabIndex={-1} disableRipple slotProps={{ input: { 'aria-hidden': true } }} /></ListItemIcon>
              <ListItemText primary={f.label} secondary="The quick brown fox jumps over the lazy dog" slotProps={{ primary: { sx: { fontFamily: f.stack } }, secondary: { sx: { fontFamily: f.stack } } }} />
            </ListItemButton>
          ))}
        </List>
        <Typography variant="mono" component="p" color="text.secondary" sx={{ fontFamily: MONO_STACK }}>{'const code = "stays monospace";'}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel}>Cancel</Button>
        <Button variant="contained" onClick={save} data-testid="font-save">Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export function ImportExportDialog() {
  const open = useUi((s) => s.dialog === 'importExport');
  const set = useUi((s) => s.set);
  const selected = useUi((s) => s.selectedNoteId);
  const input = useRef<HTMLInputElement>(null);
  const doc = () => useNotes.getState().doc;
  const exportAllJson = () => {
    const data = exportJson(doc());
    downloadText('notes-export.json', JSON.stringify(data, null, 2));
    toast(`Exported ${data.notes.length} notes`);
  };
  const exportMd = (scope: 'open' | 'all') => {
    const notes = scope === 'open' && selected && doc().notes[selected] ? [doc().notes[selected]!] : Object.values(doc().notes).filter((n) => !n.trashedAt);
    if (!notes.length) return toast('Nothing to export');
    exportMarkdown(notes).forEach((f, i) => setTimeout(() => downloadText(f.name, f.text, 'text/markdown'), i * 150));
    toast(`Exported ${notes.length} note(s) as Markdown`);
  };
  const doImport = async (files: FileList | null) => {
    if (!files?.length) return toast('No files selected');
    const r = await importFiles(Array.from(files));
    const plan = planImport(doc(), r);
    useNotes.getState().importItems(plan);
    if (!plan.notes.length && r.invalid.length) toast('Import failed: invalid file');
    else toast(r.invalid.length ? `Imported ${plan.notes.length} notes; ${r.invalid.length} file(s) invalid` : `Imported ${plan.notes.length} note(s)`);
    set({ dialog: null });
  };
  return (
    <Dialog open={open} onClose={() => set({ dialog: null })} fullWidth maxWidth="xs" aria-labelledby="ie-title">
      <DialogTitle id="ie-title">Import / export</DialogTitle>
      <DialogContent>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Export</Typography>
        <Stack spacing={1}>
          <Button variant="outlined" onClick={exportAllJson} data-testid="export-json">JSON — all notes &amp; categories</Button>
          <Button variant="outlined" onClick={() => exportMd('open')} disabled={!selected} data-testid="export-md-open">Markdown — open note</Button>
          <Button variant="outlined" onClick={() => exportMd('all')} data-testid="export-md-all">Markdown — all notes</Button>
        </Stack>
        <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Import</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Choose .json and .md files (several at once). Accepts this app’s export, the previous version’s export and the Apps Script Drive file.
        </Typography>
        <Button variant="contained" onClick={() => input.current?.click()} data-testid="import-button">Choose files…</Button>
        <input ref={input} type="file" hidden multiple accept=".json,.md,.markdown,.txt,application/json,text/markdown" data-testid="import-input" onChange={(e) => { void doImport(e.target.files); e.target.value = ''; }} />
      </DialogContent>
      <DialogActions><Button onClick={() => set({ dialog: null })}>Close</Button></DialogActions>
    </Dialog>
  );
}
