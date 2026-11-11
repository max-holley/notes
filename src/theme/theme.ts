import { alpha, createTheme, type Theme } from '@mui/material/styles';
import { schemeFromSeed, tonePair, type M3Scheme } from './scheme.ts';
import { MONO_STACK, SECTION_SEEDS, type SectionType } from './tokens.ts';

type SectionPalette = Record<SectionType, { main: string; container: string; onContainer: string }>;

declare module '@mui/material/styles' {
  interface Palette { m3: M3Scheme; sections: SectionPalette }
  interface PaletteOptions { m3?: M3Scheme; sections?: SectionPalette }
  interface TypographyVariants { mono: React.CSSProperties }
  interface TypographyVariantsOptions { mono?: React.CSSProperties }
}
declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides { mono: true }
}

/** M3 shape scale (px). */
export const SHAPE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 28, full: 999 } as const;

const sections = (dark: boolean) =>
  Object.fromEntries(Object.entries(SECTION_SEEDS).map(([k, seed]) => [k, tonePair(seed, dark)])) as SectionPalette;

function paletteFor(seed: string, dark: boolean) {
  const s = schemeFromSeed(seed, dark);
  return {
    primary: { main: s.primary, contrastText: s.onPrimary, light: s.primaryContainer, dark: s.onPrimaryContainer },
    secondary: { main: s.secondary, contrastText: s.onSecondary, light: s.secondaryContainer, dark: s.onSecondaryContainer },
    error: { main: s.error, contrastText: s.onError, light: s.errorContainer, dark: s.onErrorContainer },
    background: { default: s.surface, paper: s.surfaceContainerLow },
    text: { primary: s.onSurface, secondary: s.onSurfaceVariant },
    divider: s.outlineVariant,
    m3: s,
    sections: sections(dark),
  };
}

/** Font family references a CSS variable so the font picker can preview live without rebuilding the theme. */
export const FONT_VAR = '--app-font';
const FONT = `var(${FONT_VAR}, "Roboto", system-ui, sans-serif)`;

/** M3 type scale mapped to MUI variants. */
const typeScale = {
  h1: { fontSize: '3.5625rem', lineHeight: '4rem', fontWeight: 400, letterSpacing: '-0.016rem' }, // display large
  h2: { fontSize: '2.8125rem', lineHeight: '3.25rem', fontWeight: 400 }, // display medium
  h3: { fontSize: '2.25rem', lineHeight: '2.75rem', fontWeight: 400 }, // display small
  h4: { fontSize: '2rem', lineHeight: '2.5rem', fontWeight: 400 }, // headline large
  h5: { fontSize: '1.5rem', lineHeight: '2rem', fontWeight: 400 }, // headline small
  h6: { fontSize: '1.375rem', lineHeight: '1.75rem', fontWeight: 400 }, // title large
  subtitle1: { fontSize: '1rem', lineHeight: '1.5rem', fontWeight: 500, letterSpacing: '0.009rem' }, // title medium
  subtitle2: { fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 500, letterSpacing: '0.006rem' }, // title small
  body1: { fontSize: '1rem', lineHeight: '1.5rem', fontWeight: 400, letterSpacing: '0.031rem' }, // body large
  body2: { fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 400, letterSpacing: '0.016rem' }, // body medium
  caption: { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 400, letterSpacing: '0.025rem' }, // body small
  overline: { fontSize: '0.6875rem', lineHeight: '1rem', fontWeight: 500, letterSpacing: '0.031rem', textTransform: 'none' as const }, // label small
  button: { fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 500, letterSpacing: '0.006rem', textTransform: 'none' as const }, // label large
  mono: { fontFamily: MONO_STACK, fontSize: '0.875rem' },
};

export function createAppTheme(seed: string): Theme {
  const theme = createTheme({
    cssVariables: { colorSchemeSelector: 'class' },
    colorSchemes: { light: { palette: paletteFor(seed, false) }, dark: { palette: paletteFor(seed, true) } },
    shape: { borderRadius: SHAPE.md },
    spacing: 8,
    breakpoints: { values: { xs: 0, sm: 600, md: 840, lg: 1200, xl: 1600 } },
    typography: { fontFamily: FONT, ...typeScale },
    components: {
      MuiCssBaseline: {
        styleOverrides: (t: Theme) => ({
          body: { backgroundColor: t.vars?.palette.m3.surface, WebkitFontSmoothing: 'antialiased' },
          'code, pre, kbd': { fontFamily: MONO_STACK },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important', scrollBehavior: 'auto !important' },
          },
        }),
      },
      MuiButtonBase: { defaultProps: { disableRipple: false } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: SHAPE.full, paddingInline: 24, minHeight: 40 } },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: SHAPE.full } } },
      MuiToggleButton: { styleOverrides: { root: { textTransform: 'none' } } },
      MuiFab: {
        styleOverrides: {
          root: ({ theme: t }) => ({
            borderRadius: SHAPE.lg,
            textTransform: 'none',
            boxShadow: t.shadows[3],
            backgroundColor: t.vars!.palette.m3.primaryContainer,
            color: t.vars!.palette.m3.onPrimaryContainer,
            '&:hover': { backgroundColor: t.vars!.palette.m3.primaryContainer, filter: 'brightness(0.96)' },
          }),
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: SHAPE.sm, fontWeight: 500 } } },
      MuiCard: { styleOverrides: { root: { borderRadius: SHAPE.md } } },
      MuiPaper: { styleOverrides: { rounded: { borderRadius: SHAPE.md } } },
      MuiDialog: {
        styleOverrides: {
          paper: ({ theme: t }) => ({ borderRadius: SHAPE.xl, backgroundColor: t.vars!.palette.m3.surfaceContainerHigh, backgroundImage: 'none' }),
        },
      },
      MuiDialogTitle: { styleOverrides: { root: { ...typeScale.h5, paddingTop: 24 } } },
      MuiMenu: {
        styleOverrides: {
          paper: ({ theme: t }) => ({ borderRadius: SHAPE.xs, backgroundColor: t.vars!.palette.m3.surfaceContainer, backgroundImage: 'none', minWidth: 180 }),
        },
      },
      MuiPopover: { styleOverrides: { paper: { borderRadius: SHAPE.md, backgroundImage: 'none' } } },
      MuiMenuItem: { styleOverrides: { root: { minHeight: 48 } } },
      MuiListItemButton: {
        styleOverrides: {
          root: ({ theme: t }) => ({
            borderRadius: SHAPE.full,
            '&.Mui-selected': { backgroundColor: t.vars!.palette.m3.secondaryContainer, color: t.vars!.palette.m3.onSecondaryContainer },
            '&.Mui-selected:hover': { backgroundColor: t.vars!.palette.m3.secondaryContainer },
          }),
        },
      },
      MuiDrawer: {
        styleOverrides: { paper: ({ theme: t }) => ({ backgroundColor: t.vars!.palette.m3.surfaceContainerLow, backgroundImage: 'none', borderRight: 'none' }) },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'inherit' },
        styleOverrides: { root: ({ theme: t }) => ({ backgroundColor: t.vars!.palette.m3.surface, backgroundImage: 'none' }) },
      },
      MuiAccordion: {
        defaultProps: { disableGutters: true, elevation: 0, square: true },
        styleOverrides: { root: { backgroundColor: 'transparent', '&::before': { display: 'none' } } },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: ({ theme: t }) => ({ borderRadius: SHAPE.xs, backgroundColor: t.vars!.palette.m3.inverseSurface, color: t.vars!.palette.m3.inverseOnSurface }),
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: ({ theme: t }) => ({ borderRadius: SHAPE.xs, backgroundColor: t.vars!.palette.m3.inverseSurface, color: t.vars!.palette.m3.inverseOnSurface, ...typeScale.caption }),
        },
      },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: SHAPE.xs } } },
      MuiBottomNavigation: {
        styleOverrides: { root: ({ theme: t }) => ({ backgroundColor: t.vars!.palette.m3.surfaceContainer, height: 80 }) },
      },
      MuiBottomNavigationAction: { styleOverrides: { label: { ...typeScale.overline, '&.Mui-selected': { ...typeScale.overline } } } },
      MuiSwitch: { styleOverrides: { root: { padding: 8 } } },
      MuiSkeleton: { styleOverrides: { root: { borderRadius: SHAPE.sm } } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none' } } },
    },
  });
  return theme;
}

/** State-layer helper: M3 hover = 8%, focus/pressed = 10%. */
export const stateLayer = (color: string, kind: 'hover' | 'focus' | 'pressed' = 'hover') => alpha(color, kind === 'hover' ? 0.08 : 0.1);
