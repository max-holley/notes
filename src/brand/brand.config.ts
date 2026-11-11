/**
 * The ONE place the product's identity lives. Everything user-visible that names the
 * product (title, landing page, app bar, drawer, privacy page, manifest) reads from here.
 * Asset files are optional: drop them into `public/brand/` (see docs/BRANDING.md).
 * Only files that exist are referenced in the built HTML and manifest.
 */
export interface BrandConfig {
  /** Product name shown in the UI, <title> and manifest. */
  appName: string;
  /** Short name for the installed PWA (defaults to appName). */
  shortName?: string;
  /** One-line description used in the manifest and meta description. */
  description: string;
  /** Browser UI colour (hex). Also the manifest background colour. */
  themeColor: string;
  /** Contact / source link shown on the privacy page (optional). */
  contactUrl?: string;
}

export const brand: BrandConfig = {
  appName: 'Notes',
  description: 'Notes stored in your own Google Drive, with Google Tasks and Calendar built in.',
  themeColor: '#ffffff',
  contactUrl: 'https://github.com/max-holley/notes',
};

/** Optional files in `public/brand/`. Each key is checked for existence at build time. */
export const BRAND_ASSET_FILES = {
  logoSvg: 'logo.svg',
  logoPng: 'logo.png',
  faviconIco: 'favicon.ico',
  faviconSvg: 'favicon.svg',
  icon192: 'icon-192.png',
  icon512: 'icon-512.png',
  appleTouchIcon: 'apple-touch-icon.png',
} as const;

export type BrandAssetKey = keyof typeof BRAND_ASSET_FILES;
export const BRAND_PUBLIC_DIR = 'brand';
