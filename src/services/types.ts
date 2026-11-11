import type { SvgIconComponent } from '@mui/icons-material';
import type { ComponentType } from 'react';
import type { ServiceManifest } from './types.manifest.ts';

export interface NavDestination {
  id: string;
  label: string;
  icon: SvgIconComponent;
  component: ComponentType;
}

export interface SidebarPanel {
  id: string;
  label: string;
  component: ComponentType;
}

/** A self-contained Google service module (src/services/<id>/index.tsx default export). */
export interface GoogleService<Client = unknown> extends ServiceManifest {
  icon: SvgIconComponent;
  /** API client factory; uses the shared token provider + authFetch (src/services/http.ts). */
  apiClient: () => Client;
  /** Drawer/rail destinations (e.g. the Tasks view). */
  navDestinations?: NavDestination[];
  /** Panels shown in the sidebar/drawer (e.g. Today agenda). */
  sidebarPanels?: SidebarPanel[];
  /** Extra options shown under the service in Settings (connect/disconnect is generic). */
  settingsPanel?: ComponentType<{ connected: boolean }>;
  /** Sync lifecycle hooks. */
  syncHooks?: { onStart?(): void; onFocus?(): void; onInterval?(): void };
  /** Extra items for the open note's "more" menu (e.g. Open event / Refresh details). */
  noteMenuItems?: ComponentType<{ noteId: string; close(): void }>;
  /** Dialogs owned by the service (mounted once in the workspace). */
  dialogs?: ComponentType;
  /** Called with ids of notes changed locally. */
  onNoteChange?(noteIds: string[]): void;
  /** One-line onboarding text (landing page + consent explainer). */
  onboarding?: string;
}
