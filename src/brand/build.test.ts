import { describe, expect, it } from 'vitest';
import { brand, BRAND_ASSET_FILES } from './brand.config.ts';
import { buildHeadTags, buildManifest, resolveBrandAssets } from './build.ts';

describe('brand config build', () => {
  it('with no brand files: plain name, no logo, no favicon, valid manifest without icons', () => {
    const assets = resolveBrandAssets(() => false);
    expect(assets.logoUrl).toBeNull();
    const tags = buildHeadTags(brand, assets).join('\n');
    expect(tags).toContain(`<title>${brand.appName}</title>`);
    expect(tags).not.toMatch(/rel="(icon|apple-touch-icon)"/);
    const m = buildManifest(brand, assets);
    expect(m).toMatchObject({ name: brand.appName, short_name: brand.appName, start_url: '/app', display: 'standalone', icons: [] });
  });

  it('with every brand file: links and manifest icons only for files that exist', () => {
    const all = resolveBrandAssets(() => true);
    expect(all.logoUrl).toBe('/brand/logo.svg');
    const tags = buildHeadTags(brand, all).join('\n');
    expect(tags).toContain('<link rel="icon" href="/brand/favicon.ico"');
    expect(tags).toContain('<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml"');
    expect(tags).toContain('<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png"');
    expect(buildManifest(brand, all).icons.map((i) => i.sizes)).toEqual(['192x192', '512x512', 'any']);
    const some = resolveBrandAssets((f) => f === BRAND_ASSET_FILES.logoPng || f === BRAND_ASSET_FILES.icon192);
    expect(some.logoUrl).toBe('/brand/logo.png');
    expect(buildManifest(brand, some).icons).toHaveLength(1);
  });

  it('escapes config values in HTML', () => {
    const tags = buildHeadTags({ ...brand, appName: 'A <b>"x"</b>' }, resolveBrandAssets(() => false)).join('');
    expect(tags).toContain('A &lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  });
});
