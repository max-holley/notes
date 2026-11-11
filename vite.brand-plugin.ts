import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { brand, BRAND_PUBLIC_DIR } from './src/brand/brand.config.ts';
import { buildHeadTags, buildManifest, resolveBrandAssets } from './src/brand/build.ts';

const VIRTUAL_ID = 'virtual:brand-assets';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

/** Generates <head> tags, manifest.webmanifest and the `virtual:brand-assets` module from existing brand files. */
export function brandPlugin(root = process.cwd()): Plugin {
  const dir = path.join(root, 'public', BRAND_PUBLIC_DIR);
  const assets = () => resolveBrandAssets((f) => fs.existsSync(path.join(dir, f)));
  return {
    name: 'brand',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
    load: (id) => (id === RESOLVED_ID ? `export default ${JSON.stringify(assets())};` : undefined),
    transformIndexHtml: (html) => html.replace('<!--brand-head-->', buildHeadTags(brand, assets()).join('\n    ')),
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(JSON.stringify(buildManifest(brand, assets()), null, 2));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(buildManifest(brand, assets()), null, 2) });
    },
  };
}
