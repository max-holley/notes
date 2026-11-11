import { serviceManifests } from './registry.ts';
import type { ServiceManifest } from './types.manifest.ts';
import type { GoogleService, NavDestination, SidebarPanel } from './types.ts';

type ModuleMap = Record<string, { default: GoogleService }>;

/** Pair every registered manifest with its UI module (`./<id>/index.tsx`). */
export function buildServices(manifests: readonly ServiceManifest[], modules: ModuleMap): GoogleService[] {
  return manifests.map((m) => {
    const mod = modules[`./${m.id}/index.tsx`];
    if (!mod) throw new Error(`Service "${m.id}" is registered but src/services/${m.id}/index.tsx is missing`);
    return { ...mod.default, ...m };
  });
}

export const navDestinations = (list: GoogleService[], connected: string[]): (NavDestination & { serviceId: string; connected: boolean })[] =>
  list.flatMap((s) => (s.navDestinations ?? []).map((d) => ({ ...d, serviceId: s.id, connected: connected.includes(s.id) })));

export const sidebarPanels = (list: GoogleService[], connected: string[]): (SidebarPanel & { serviceId: string; connected: boolean })[] =>
  list.flatMap((s) => (s.sidebarPanels ?? []).map((p) => ({ ...p, serviceId: s.id, connected: connected.includes(s.id) })));

const modules = import.meta.glob<{ default: GoogleService }>('./*/index.tsx', { eager: true });
export const services: GoogleService[] = buildServices(serviceManifests, modules);
export const serviceById = (id: string) => services.find((s) => s.id === id);
