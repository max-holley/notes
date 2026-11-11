/**
 * Design tokens. Raw colour values are allowed ONLY in src/theme/ (enforced by scripts/audit-style.mjs).
 */
export interface AccentSwatch { id: string; label: string; seed: string }

/** Accent swatches (seed colours for the M3 tonal palette). Kept from the legacy app. */
export const ACCENTS: AccentSwatch[] = [
  { id: 'indigo', label: 'Indigo', seed: '#5b6cff' },
  { id: 'blue', label: 'Blue', seed: '#0b57d0' },
  { id: 'purple', label: 'Purple', seed: '#af52de' },
  { id: 'pink', label: 'Pink', seed: '#e91e8c' },
  { id: 'teal', label: 'Teal', seed: '#00a39b' },
  { id: 'green', label: 'Green', seed: '#34c759' },
  { id: 'orange', label: 'Orange', seed: '#ff9f0a' },
  { id: 'red', label: 'Red', seed: '#ff453a' },
];
export const DEFAULT_ACCENT = 'blue';
export const accentSeed = (id: string) => (ACCENTS.find((a) => a.id === id) ?? ACCENTS[1]!).seed;

/** Category colours offered in the category dialog. */
export const CATEGORY_COLORS = ['#5b6cff', '#e8467c', '#1e8e3e', '#e37400', '#9334e6', '#00897b', '#d93025', '#5f6368'];
export const DEFAULT_CATEGORY_COLORS: Record<string, string> = { Personal: '#5b6cff', Work: '#e37400', Ideas: '#1e8e3e' };

/** Text colours offered in the editor. */
export const TEXT_COLORS = [
  { label: 'Default', value: null },
  { label: 'Grey', value: '#5f6368' },
  { label: 'Red', value: '#d93025' },
  { label: 'Orange', value: '#e37400' },
  { label: 'Green', value: '#1e8e3e' },
  { label: 'Teal', value: '#00897b' },
  { label: 'Blue', value: '#1a73e8' },
  { label: 'Purple', value: '#9334e6' },
  { label: 'Pink', value: '#e8467c' },
] as const;

export const HIGHLIGHT_COLORS = [
  { label: 'Yellow', value: '#fdd663' },
  { label: 'Green', value: '#a8dab5' },
  { label: 'Blue', value: '#aecbfa' },
  { label: 'Pink', value: '#fdcfe8' },
] as const;

export type SectionType = 'info' | 'note' | 'success' | 'warning' | 'error';
export const SECTION_SEEDS: Record<SectionType, string> = {
  info: '#1a73e8',
  note: '#9334e6',
  success: '#1e8e3e',
  warning: '#e37400',
  error: '#d93025',
};

/** Fonts offered in Settings → Font. `stack` is the CSS font-family value. */
export const FONTS = [
  { id: 'roboto', label: 'Roboto', stack: '"Roboto", system-ui, sans-serif' },
  { id: 'inter', label: 'Inter', stack: '"Inter", system-ui, sans-serif' },
  { id: 'open-sans', label: 'Open Sans', stack: '"Open Sans", system-ui, sans-serif' },
  { id: 'lato', label: 'Lato', stack: '"Lato", system-ui, sans-serif' },
  { id: 'noto-sans', label: 'Noto Sans', stack: '"Noto Sans", system-ui, sans-serif' },
  { id: 'source-sans-3', label: 'Source Sans 3', stack: '"Source Sans 3", system-ui, sans-serif' },
  { id: 'roboto-serif', label: 'Roboto Serif', stack: '"Roboto Serif", Georgia, serif' },
  { id: 'merriweather', label: 'Merriweather', stack: '"Merriweather", Georgia, serif' },
  { id: 'roboto-mono', label: 'Roboto Mono', stack: '"Roboto Mono", ui-monospace, monospace' },
  { id: 'system', label: 'System', stack: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
] as const;
export type FontId = (typeof FONTS)[number]['id'];
export const DEFAULT_FONT: FontId = 'roboto';
export const fontStack = (id: string) => (FONTS.find((f) => f.id === id) ?? FONTS[0]).stack;
export const MONO_STACK = '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
