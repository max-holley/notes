import { argbFromHex, Hct, hexFromArgb, MaterialDynamicColors as C, SchemeTonalSpot } from '@material/material-color-utilities';

export interface M3Scheme {
  primary: string; onPrimary: string; primaryContainer: string; onPrimaryContainer: string;
  secondary: string; onSecondary: string; secondaryContainer: string; onSecondaryContainer: string;
  tertiary: string; onTertiary: string; tertiaryContainer: string; onTertiaryContainer: string;
  error: string; onError: string; errorContainer: string; onErrorContainer: string;
  surface: string; onSurface: string; onSurfaceVariant: string; surfaceDim: string; surfaceBright: string;
  surfaceContainerLowest: string; surfaceContainerLow: string; surfaceContainer: string;
  surfaceContainerHigh: string; surfaceContainerHighest: string;
  outline: string; outlineVariant: string; inverseSurface: string; inverseOnSurface: string; inversePrimary: string; scrim: string;
}

const ROLES = {
  primary: C.primary, onPrimary: C.onPrimary, primaryContainer: C.primaryContainer, onPrimaryContainer: C.onPrimaryContainer,
  secondary: C.secondary, onSecondary: C.onSecondary, secondaryContainer: C.secondaryContainer, onSecondaryContainer: C.onSecondaryContainer,
  tertiary: C.tertiary, onTertiary: C.onTertiary, tertiaryContainer: C.tertiaryContainer, onTertiaryContainer: C.onTertiaryContainer,
  error: C.error, onError: C.onError, errorContainer: C.errorContainer, onErrorContainer: C.onErrorContainer,
  surface: C.surface, onSurface: C.onSurface, onSurfaceVariant: C.onSurfaceVariant, surfaceDim: C.surfaceDim, surfaceBright: C.surfaceBright,
  surfaceContainerLowest: C.surfaceContainerLowest, surfaceContainerLow: C.surfaceContainerLow, surfaceContainer: C.surfaceContainer,
  surfaceContainerHigh: C.surfaceContainerHigh, surfaceContainerHighest: C.surfaceContainerHighest,
  outline: C.outline, outlineVariant: C.outlineVariant, inverseSurface: C.inverseSurface, inverseOnSurface: C.inverseOnSurface,
  inversePrimary: C.inversePrimary, scrim: C.scrim,
} as const;

/** Generate an M3 tonal-spot scheme from a seed colour. */
export function schemeFromSeed(seedHex: string, dark: boolean): M3Scheme {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seedHex)), dark, 0);
  const out = {} as M3Scheme;
  for (const [k, role] of Object.entries(ROLES)) out[k as keyof M3Scheme] = hexFromArgb(role.getArgb(scheme));
  return out;
}

/** Container/on-container pair for a fixed seed (used for sections, chips). */
export function tonePair(seedHex: string, dark: boolean) {
  const s = schemeFromSeed(seedHex, dark);
  return { main: s.primary, container: s.primaryContainer, onContainer: s.onPrimaryContainer };
}
