// pnpm verify: typecheck → lint → unit → e2e (mock Google) → brand audit. Prints full output; non-zero exit on any failure.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const steps = [
  ['typecheck', 'pnpm', ['typecheck']],
  ['lint', 'pnpm', ['lint']],
  ['unit', 'pnpm', ['test']],
  ['e2e (mock Google)', 'pnpm', ['e2e']],
  ['audit:brand', 'pnpm', ['audit:brand']],
];
const results = [];
for (const [name, cmd, args] of steps) {
  console.log(`\n=== ${name}: ${cmd} ${args.join(' ')} ===`);
  const t = Date.now();
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  results.push({ name, ok: r.status === 0, secs: ((Date.now() - t) / 1000).toFixed(1) });
}
console.log('\n=== verify summary ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.secs}s)`);
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\nverify FAILED: ${failed.map((f) => f.name).join(', ')}` : '\nverify PASSED');
process.exit(failed.length ? 1 : 0);
