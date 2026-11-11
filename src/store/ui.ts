import { create } from 'zustand';
import type { AppConfig, Me } from '../lib/api.ts';
import type { SyncStatus } from '../sync/engine.ts';

export type View = 'notes' | 'trash' | string; // service nav destinations use their own ids
export type DialogId =
  | 'settings' | 'devices' | 'deleteAccount' | 'font' | 'toolbar' | 'importExport' | 'categories' | 'tagManager'
  | 'meetingNote' | 'stats' | null;

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  duration?: number;
}

interface UiState {
  // session
  status: 'loading' | 'signedOut' | 'signedIn';
  me: Me | null;
  config: AppConfig | null;
  sync: SyncStatus;
  syncRetryIn: number | null;
  needsReconnect: boolean;
  // navigation
  view: View;
  selectedNoteId: string | null;
  filterCategory: string | null | 'uncategorized';
  filterTags: string[];
  search: string;
  showArchived: boolean;
  /** compact layout: which single pane is visible */
  mobilePane: 'list' | 'editor';
  drawerOpen: boolean;
  dialog: DialogId;
  categoryDialog: { id: string | null } | null;
  toasts: Toast[];
  /** Line to scroll to when opening a note from the Tasks view. */
  focusLineId: string | null;

  set(patch: Partial<UiState>): void;
  openNote(id: string | null, lineId?: string | null): void;
  toast(message: string, action?: Toast['action'], duration?: number): void;
  dismissToast(id: number): void;
}

let toastId = 0;

export const useUi = create<UiState>()((set, get) => ({
  status: 'loading',
  me: null,
  config: null,
  sync: 'idle',
  syncRetryIn: null,
  needsReconnect: false,
  view: 'notes',
  selectedNoteId: null,
  filterCategory: null,
  filterTags: [],
  search: '',
  showArchived: false,
  mobilePane: 'list',
  drawerOpen: false,
  dialog: null,
  categoryDialog: null,
  toasts: [],
  focusLineId: null,
  set: (patch) => set(patch),
  openNote(id, lineId = null) {
    set({ selectedNoteId: id, mobilePane: id ? 'editor' : 'list', focusLineId: lineId });
    const url = new URL(location.href);
    if (id) url.searchParams.set('note', id);
    else url.searchParams.delete('note');
    history.replaceState(null, '', url);
  },
  toast(message, action, duration) {
    set({ toasts: [...get().toasts, { id: ++toastId, message, action, duration }] });
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (message: string, action?: Toast['action'], duration?: number) => useUi.getState().toast(message, action, duration);
