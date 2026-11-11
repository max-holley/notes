// Brand audit: proves the app is unbranded outside the single brand config.
//  1. No logo / icon / favicon / manifest-icon files anywhere except public/brand/.
//  2. No logo / icon / favicon strings and no hard-coded app name outside src/brand/ and public/brand/.
//  3. The app builds with only the files present in public/brand/ (empty by default) and the built HTML +
//     manifest reference exactly those files: no favicon, no logo, a valid manifest with no icons.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.wrangler', 'test-results', 'playwright-report', 'screenshots', 'coverage', '.claude']);
/** Documents that legitimately describe the brand slots (instructions, not branding). */
const DOC_ALLOW = new Set(['REBUILD.md', 'docs/BRANDING.md', 'REPORT.md', 'scripts/audit-brand.mjs']);
const ALLOWED_PREFIXES = ['src/brand/', 'public/brand/'];
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|jsonc|html|css|md|webmanifest|svg|yml|yaml|toml|txt)$/i;
const ASSET_FILE = /(^|[/\\])(logo[^/\\]*\.(svg|png|jpe?g|webp)|favicon[^/\\]*|apple-touch-icon[^/\\]*|icon(-\d+)?\.(svg|png|ico)|manifest\.webmanifest|CNAME)$/i;
const BRAND_STRING = /favicon|apple-touch-icon|icon-(192|512)|logo\.(svg|png)|rel=["']icon|["']icons["']\s*:/i;

const { brandName, brandIsDefault } = (() => {
  const src = fs.readFileSync(path.join(root, 'src/brand/brand.config.ts'), 'utf8');
  const name = src.match(/appName:\s*'([^']+)'/)?.[1];
  return { brandName: name, brandIsDefault: !!name };
})();
const NAME_LITERAL = brandName ? new RegExp(`(['"\`>])${brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1|>${brandName}<`) : null;

const problems = [];
let scanned = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else check(p);
  }
}
function check(file) {
  const r = rel(file);
  const allowed = ALLOWED_PREFIXES.some((pre) => r.startsWith(pre));
  if (!allowed && ASSET_FILE.test(r)) problems.push(`${r}: brand asset file outside public/brand/`);
  if (!TEXT.test(r) || allowed || DOC_ALLOW.has(r)) return;
  scanned++;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (BRAND_STRING.test(line)) problems.push(`${r}:${i + 1}: brand asset reference: ${line.trim().slice(0, 100)}`);
    if (NAME_LITERAL && /^(src|worker|e2e|public|index\.html)/.test(r) && NAME_LITERAL.test(line)) problems.push(`${r}:${i + 1}: hard-coded app name "${brandName}" (use brand.appName)`);
  });
}
walk(root);

// Build with the current public/brand/ contents and inspect the output.
const outDir = path.join(root, 'node_modules', '.brand-audit');
fs.rmSync(outDir, { recursive: true, force: true });
const build = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], { cwd: root, shell: process.platform === 'win32', encoding: 'utf8' });
if (build.status !== 0) problems.push(`vite build failed:\n${build.stdout}\n${build.stderr}`);
else {
  const brandDir = path.join(root, 'public', 'brand');
  const present = fs.existsSync(brandDir) ? fs.readdirSync(brandDir).filter((f) => !f.startsWith('.')) : [];
  const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.webmanifest'), 'utf8'));
  if (!html.includes(`<title>${brandName}</title>`)) problems.push('built index.html: <title> does not come from brand.appName');
  const linked = [...html.matchAll(/href="\/brand\/([^"]+)"/g)].map((m) => m[1]);
  for (const f of linked) if (!present.includes(f)) problems.push(`built index.html links missing brand file ${f}`);
  if (!present.some((f) => /favicon|apple-touch/.test(f)) && /rel="(icon|apple-touch-icon)"/.test(html)) problems.push('built index.html has an icon link with no icon files present');
  for (const i of manifest.icons ?? []) if (!present.includes(i.src.replace('/brand/', ''))) problems.push(`manifest icon ${i.src} does not exist`);
  if (manifest.name !== brandName || !manifest.start_url) problems.push('manifest.webmanifest is invalid or not derived from brand config');
  console.log(`Build check: public/brand/ has ${present.length ? present.join(', ') : 'no files'}; HTML brand links: ${linked.length ? linked.join(', ') : 'none'}; manifest icons: ${(manifest.icons ?? []).length}.`);
}
fs.rmSync(outDir, { recursive: true, force: true });

if (problems.length) {
  console.error(`Brand audit FAILED (${problems.length}):\n` + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`Brand audit passed: scanned ${scanned} text files; no brand assets or strings outside src/brand/ and public/brand/; app name only from brand config${brandIsDefault ? ` ("${brandName}")` : ''}.`);
