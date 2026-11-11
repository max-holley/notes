// Design-system guard: no raw hex colours or px font sizes in app UI code outside src/theme/ and src/brand/.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ALLOWED_DIRS = [path.join('src', 'theme'), path.join('src', 'brand')];
const HEX = /(['"`])#[0-9a-fA-F]{3,8}\1|:\s*#[0-9a-fA-F]{3,8}\b/;
const PX_FONT = /font-?size['"]?\s*:\s*['"]?\d+(\.\d+)?px/i;
const failures = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name)) check(p);
  }
}
function check(file) {
  const rel = path.relative(root, file);
  if (ALLOWED_DIRS.some((d) => rel.startsWith(d))) return;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (line.includes('audit-style-ignore')) return;
    if (HEX.test(line)) failures.push(`${rel}:${i + 1}: raw hex colour (use theme tokens)`);
    if (PX_FONT.test(line)) failures.push(`${rel}:${i + 1}: px font size (use theme typography)`);
  });
}
walk(path.join(root, 'src'));
if (failures.length) {
  console.error('Style audit failed:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('Style audit passed: no raw hex colours or px font sizes outside src/theme and src/brand.');
