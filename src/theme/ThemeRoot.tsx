import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, useColorScheme } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { useEffect, useMemo, type ReactNode } from 'react';
import { getLocal, LS, setLocal } from '../lib/localPrefs.ts';
import { useNotes } from '../store/notes.ts';
import { createAppTheme, FONT_VAR } from './theme.ts';
import { accentSeed, DEFAULT_ACCENT, fontStack } from './tokens.ts';

/** Applies synced prefs (mode, font) once the notes file has loaded. */
function PrefsBridge() {
  const { setMode } = useColorScheme();
  const loaded = useNotes((s) => s.loaded);
  const theme = useNotes((s) => s.doc.prefs.theme);
  const font = useNotes((s) => s.doc.prefs.font);
  const updatedAt = useNotes((s) => s.doc.prefs.updatedAt);
  useEffect(() => {
    if (loaded && updatedAt) setMode(theme);
  }, [loaded, theme, updatedAt, setMode]);
  useEffect(() => {
    if (!loaded || !updatedAt) return;
    applyFont(font);
    setLocal(LS.font, font);
  }, [loaded, font, updatedAt]);
  return null;
}

export function applyFont(id: string) {
  document.documentElement.style.setProperty(FONT_VAR, fontStack(id));
}

export function ThemeRoot({ children }: { children: ReactNode }) {
  const prefsAccent = useNotes((s) => (s.loaded && s.doc.prefs.updatedAt ? s.doc.prefs.accent : null));
  const accent = prefsAccent ?? getLocal(LS.accent) ?? DEFAULT_ACCENT;
  useEffect(() => {
    if (prefsAccent) setLocal(LS.accent, prefsAccent);
  }, [prefsAccent]);
  const theme = useMemo(() => createAppTheme(accentSeed(accent)), [accent]);
  return (
    <ThemeProvider theme={theme} defaultMode="system" modeStorageKey={LS.mode}>
      <CssBaseline enableColorScheme />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <PrefsBridge />
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  );
}
