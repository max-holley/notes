import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error -- plain ESM script without types
import { addToRegistry, templates } from '../../scripts/new-service.mjs';
import { buildServices, navDestinations, services, sidebarPanels } from './index.ts';
import { allowedScopes, buildCsp, connectSrc, filterAllowedScopes, grantedServiceIds, serviceManifests, signInScopes } from './registry.ts';
import type { ServiceManifest } from './types.manifest.ts';
import type { GoogleService } from './types.ts';

const dummyManifest: ServiceManifest = {
  id: 'dummy',
  label: 'Google Dummy',
  description: 'Throwaway test service',
  scopes: ['https://www.googleapis.com/auth/dummy.readonly'],
  apiOrigins: ['https://dummy.googleapis.com'],
};
const DummyView = () => null;
const dummyModule: GoogleService = {
  ...dummyManifest,
  icon: (() => null) as unknown as GoogleService['icon'],
  apiClient: () => ({}),
  navDestinations: [{ id: 'dummy', label: 'Dummy', icon: (() => null) as unknown as GoogleService['icon'], component: DummyView }],
  sidebarPanels: [{ id: 'dummy-panel', label: 'Dummy panel', component: DummyView }],
};

describe('service registry', () => {
  it('ships drive (required), tasks and calendar with exactly the documented scopes', () => {
    expect(serviceManifests.map((s) => s.id)).toEqual(['drive', 'tasks', 'calendar']);
    expect(serviceManifests.find((s) => s.id === 'drive')!.required).toBe(true);
    expect(allowedScopes()).toEqual([
      'openid', 'email', 'profile',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ]);
    expect(signInScopes()).toEqual(allowedScopes());
    expect(services.map((s) => s.id)).toEqual(['drive', 'tasks', 'calendar']);
  });

  it('derives scopes, CSP, granted services, nav and panels from the registry alone', () => {
    const list = [...serviceManifests, dummyManifest];
    expect(allowedScopes(list)).toContain('https://www.googleapis.com/auth/dummy.readonly');
    expect(filterAllowedScopes(['https://www.googleapis.com/auth/dummy.readonly', 'https://evil/scope'], list)).toEqual(['https://www.googleapis.com/auth/dummy.readonly']);
    expect(connectSrc(list)).toContain('https://dummy.googleapis.com');
    expect(buildCsp(list)).toMatch(/connect-src [^;]*https:\/\/dummy\.googleapis\.com/);
    expect(buildCsp()).not.toContain('dummy');
    expect(grantedServiceIds(['https://www.googleapis.com/auth/dummy.readonly'], list)).toEqual(['dummy']);
    const built = buildServices(list, {
      ...Object.fromEntries(services.map((s) => [`./${s.id}/index.tsx`, { default: s }])),
      './dummy/index.tsx': { default: dummyModule },
    });
    expect(navDestinations(built, ['dummy']).map((d) => d.id)).toContain('dummy');
    expect(sidebarPanels(built, []).find((p) => p.id === 'dummy-panel')?.connected).toBe(false);
    expect(() => buildServices(list, {})).toThrow(/dummy|drive/);
  });

  it('pnpm new:service scaffolds a folder and only touches the registry', () => {
    const files = templates({ id: 'dummy', label: 'Google Dummy', scope: 'https://www.googleapis.com/auth/dummy', origin: 'https://dummy.googleapis.com' }) as Record<string, string>;
    expect(Object.keys(files).sort()).toEqual(['index.tsx', 'manifest.ts']);
    expect(files['manifest.ts']).toContain("id: 'dummy'");
    expect(files['index.tsx']).toContain('export default dummy');
    const reg = fs.readFileSync(path.resolve(__dirname, 'registry.ts'), 'utf8').replace(/\r\n/g, '\n');
    const updated = addToRegistry(reg, 'dummy') as string;
    expect(updated).toContain("import { dummyManifest } from './dummy/manifest.ts';");
    expect(updated).toMatch(/serviceManifests: readonly ServiceManifest\[\] = \[driveManifest, tasksManifest, calendarManifest, dummyManifest\]/);
    // Nothing else in the registry changes.
    expect(updated.replace("import { dummyManifest } from './dummy/manifest.ts';\n", '').replace(', dummyManifest]', ']')).toBe(reg);
    expect(addToRegistry(updated, 'dummy')).toBe(updated);
  });
});
