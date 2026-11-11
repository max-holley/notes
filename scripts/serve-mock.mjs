// Builds the app and serves it with `wrangler dev` in mock-Google mode on :8787 (fresh local D1 each run).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const persist = path.join(root, '.wrangler', 'e2e');
const port = process.env.PORT ?? '8787';
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (!process.env.SKIP_BUILD) run('npx', ['vite', 'build']);
fs.rmSync(persist, { recursive: true, force: true });
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', persist]);
const child = spawn('npx', ['wrangler', 'dev', '--port', port, '--ip', '127.0.0.1', '--var', 'MOCK_GOOGLE:1', '--persist-to', persist, '--show-interactive-dev-session=false'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
