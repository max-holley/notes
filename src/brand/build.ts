import { BRAND_ASSET_FILES, BRAND_PUBLIC_DIR, type BrandAssetKey, type BrandConfig } from './brand.config.ts';

export interface BrandAssets {
  logoUrl: string | null;
  present: Partial<Record<BrandAssetKey, string>>;
}

export interface WebManifest {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
}

/** Resolve which optional brand files exist. `exists` receives a file name inside public/brand/. */
export function resolveBrandAssets(exists: (file: string) => boolean): BrandAssets {
  const present: Partial<Record<BrandAssetKey, string>> = {};
  for (const [key, file] of Object.entries(BRAND_ASSET_FILES) as [BrandAssetKey, string][]) {
    if (exists(file)) present[key] = `/${BRAND_PUBLIC_DIR}/${file}`;
  }
  return { logoUrl: present.logoSvg ?? present.logoPng ?? null, present };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** <head> tags generated only from files that exist. */
export function buildHeadTags(config: BrandConfig, assets: BrandAssets): string[] {
  const p = assets.present;
  const tags = [
    `<title>${escapeHtml(config.appName)}</title>`,
    `<meta name="description" content="${escapeHtml(config.description)}" />`,
    `<meta name="theme-color" content="${escapeHtml(config.themeColor)}" />`,
    `<meta name="application-name" content="${escapeHtml(config.appName)}" />`,
    `<link rel="manifest" href="/manifest.webmanifest" />`,
  ];
  if (p.faviconIco) tags.push(`<link rel="icon" href="${p.faviconIco}" sizes="any" />`);
  if (p.faviconSvg) tags.push(`<link rel="icon" href="${p.faviconSvg}" type="image/svg+xml" />`);
  if (p.appleTouchIcon) tags.push(`<link rel="apple-touch-icon" href="${p.appleTouchIcon}" />`);
  return tags;
}

export function buildManifest(config: BrandConfig, assets: BrandAssets): WebManifest {
  const icons: WebManifest['icons'] = [];
  if (assets.present.icon192) icons.push({ src: assets.present.icon192, sizes: '192x192', type: 'image/png' });
  if (assets.present.icon512) icons.push({ src: assets.present.icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' });
  if (assets.present.faviconSvg) icons.push({ src: assets.present.faviconSvg, sizes: 'any', type: 'image/svg+xml' });
  return {
    name: config.appName,
    short_name: config.shortName ?? config.appName,
    description: config.description,
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: config.themeColor,
    theme_color: config.themeColor,
    icons,
  };
}
