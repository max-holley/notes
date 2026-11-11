// Scaffold a new Google service module: `pnpm new:service <id> [--label "Google Keep"] [--scope <url>] [--origin <url>]`
// Creates src/services/<id>/{manifest.ts,index.tsx} and adds one line + one import to src/services/registry.ts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pascal = (id) => id.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
const camel = (id) => pascal(id).replace(/^\w/, (c) => c.toLowerCase());

export function templates({ id, label, scope, origin }) {
  const name = camel(id);
  return {
    'manifest.ts': `import type { ServiceManifest } from '../types.manifest.ts';

export const ${name}Manifest: ServiceManifest = {
  id: '${id}',
  label: '${label}',
  description: 'TODO: one sentence shown in Settings and on the consent explainer.',
  scopes: ['${scope}'],
  apiOrigins: ['${origin}'],
};
`,
    'index.tsx': `import ExtensionOutlined from '@mui/icons-material/ExtensionOutlined';
import { authJson } from '../http.ts';
import type { GoogleService } from '../types.ts';
import { ${name}Manifest } from './manifest.ts';

/** API client: every call goes through the shared token provider (authJson/authFetch). */
const client = {
  // Example: ping: () => authJson<unknown>('${origin}/...', { scopes: ${name}Manifest.scopes }),
  authJson,
};

const ${name}: GoogleService<typeof client> = {
  ...${name}Manifest,
  icon: ExtensionOutlined,
  apiClient: () => client,
  // navDestinations: [{ id: '${id}', label: '${label}', icon: ExtensionOutlined, component: MyView }],
  // sidebarPanels: [{ id: '${id}-panel', label: '${label}', component: MyPanel }],
  // settingsPanel: MySettings,
  // syncHooks: { onStart() {}, onFocus() {}, onInterval() {} },
  // onNoteChange(noteIds) {},
};

export default ${name};
`,
  };
}

/** Insert the import + registry entry into registry.ts source. */
export function addToRegistry(src, id) {
  const name = camel(id);
  if (src.includes(`${name}Manifest`)) return src;
  const importLine = `import { ${name}Manifest } from './${id}/manifest.ts';`;
  const lastImport = [...src.matchAll(/^import .*;$/gm)].pop();
  const at = lastImport.index + lastImport[0].length;
  src = src.slice(0, at) + '\n' + importLine + src.slice(at);
  return src.replace(/(export const serviceManifests: readonly ServiceManifest\[\] = \[)([^\]]*)\]/, (_, head, list) => `${head}${list.trim()}, ${name}Manifest]`);
}

function main(argv) {
  const id = argv[0];
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error('Usage: pnpm new:service <id> [--label "Label"] [--scope <oauth scope>] [--origin <api origin>]');
    process.exit(1);
  }
  const opt = (k, d) => {
    const i = argv.indexOf(`--${k}`);
    return i > 0 ? argv[i + 1] : d;
  };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = path.join(root, 'src', 'services', id);
  if (fs.existsSync(dir)) {
    console.error(`src/services/${id} already exists`);
    process.exit(1);
  }
  fs.mkdirSync(dir, { recursive: true });
  const files = templates({ id, label: opt('label', `Google ${pascal(id)}`), scope: opt('scope', `https://www.googleapis.com/auth/${id}`), origin: opt('origin', 'https://www.googleapis.com') });
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), text);
  const reg = path.join(root, 'src', 'services', 'registry.ts');
  fs.writeFileSync(reg, addToRegistry(fs.readFileSync(reg, 'utf8'), id));
  console.log(`Created src/services/${id}/ and registered it in src/services/registry.ts.\nNext: fill in manifest.ts (scopes, origins) and index.tsx. See docs/ADDING_A_GOOGLE_SERVICE.md.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
