import { emptyDoc, type NotesDoc } from '../data/model.ts';
import { api, HttpError, type Me } from '../lib/api.ts';
import { clearLocalHints, setSignedInHint } from '../lib/localPrefs.ts';
import { services } from '../services/index.ts';
import { clearTokens, configureGoogle } from '../services/http.ts';
import { collectImageGarbage, driveTransport, resetDriveCache } from '../services/drive/client.ts';
import { SYNC, SyncEngine, type Transport } from '../sync/engine.ts';
import { applyChanges, normalizeDoc, type Change } from '../sync/merge.ts';
import { outbox } from '../sync/outbox.ts';
import { seedDefaults, setChangeSink, useNotes } from '../store/notes.ts';
import { toast, useUi } from '../store/ui.ts';

let engine: SyncEngine | null = null;
let teardown: (() => void)[] = [];
let syncChannel: BroadcastChannel | null = null;

export const getEngine = () => engine;

/** Load config + session. Signed-out users see the landing page. */
export async function startApp() {
  const ui = useUi.getState();
  try {
    const config = await api.config();
    ui.set({ config });
    const me = await api.me();
    configureGoogle(config, () => useUi.getState().set({ needsReconnect: true, sync: 'reconnect' }));
    ui.set({ me, needsReconnect: me.needsReconnect, status: 'signedIn' });
    setSignedInHint();
    await startSync(me);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) ui.set({ status: 'signedOut' });
    else {
      ui.set({ status: 'signedOut' });
      console.error('Start-up failed', e instanceof Error ? e.message : 'unknown error');
    }
  }
}

export async function refreshMe() {
  const me = await api.me();
  useUi.getState().set({ me, needsReconnect: me.needsReconnect });
  return me;
}

async function startSync(me: Me) {
  const userId = me.user.id;
  const working = await outbox.loadWorking(userId).catch(() => null);
  if (!working) await outbox.wipeAll().catch(() => undefined); // never mix another user's queued edits
  const pending = await outbox.all().catch(() => [] as Change[]);
  const start = applyChanges(working ? normalizeDoc(working) : emptyDoc(), pending);
  if (working || pending.length) useNotes.getState().load(start);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const saveWorking = (doc: NotesDoc) => {
    if (stopped) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void outbox.saveWorking(userId, doc).catch(() => undefined), 300);
  };

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`notes-sync-${userId}`) : null;
  channel?.addEventListener('message', (ev: MessageEvent<{ type: string; changes?: Change[] }>) => {
    if (ev.data.type === 'changes' && ev.data.changes) useNotes.getState().applyForeign(ev.data.changes);
    if (ev.data.type === 'synced') engine?.pullIfStale();
    if (ev.data.type === 'signout') void wipeLocal().then(() => location.assign('/'));
  });
  syncChannel = channel;

  let remoteWasEmpty = false;
  const transport: Transport = {
    pull: async () => {
      const r = await driveTransport.pull();
      remoteWasEmpty = !r.doc;
      return r;
    },
    push: (doc, rev) => driveTransport.push(doc, rev),
  };

  engine = new SyncEngine({
    transport,
    outbox,
    getLocal: () => useNotes.getState().doc,
    applyRemote: (doc) => {
      useNotes.getState().applyRemote(doc);
      saveWorking(useNotes.getState().doc);
      channel?.postMessage({ type: 'synced' });
    },
    onStatus: (s, info) => useUi.getState().set({ sync: s, syncRetryIn: info?.retryInMs ?? null, ...(s === 'reconnect' ? { needsReconnect: true } : {}) }),
    onSizeWarning: (bytes) => toast(`Your notes file is ${(bytes / 1048576).toFixed(0)} MB. Consider archiving or deleting large notes.`),
    lock: typeof navigator !== 'undefined' && navigator.locks ? <T,>(fn: () => Promise<T>) => navigator.locks.request(`notes-sync-${userId}`, fn) as unknown as Promise<T> : undefined,
  });

  setChangeSink({
    onChanges(changes, doc) {
      void outbox.put(changes).catch(() => undefined);
      saveWorking(doc);
      channel?.postMessage({ type: 'changes', changes });
      engine?.schedule();
      const noteIds = changes.filter((c) => c.col === 'notes').map((c) => c.id);
      if (noteIds.length) for (const s of services) s.onNoteChange?.(noteIds);
    },
  });

  await engine.flush();
  if (remoteWasEmpty && useUi.getState().sync === 'synced') seedDefaults();
  useNotes.setState({ loaded: true });
  setTimeout(() => void collectImageGarbage(useNotes.getState().doc).catch(() => undefined), 10_000);

  const onVisibility = () => (document.visibilityState === 'hidden' ? void engine?.flush() : engine?.pullIfStale());
  const onPageHide = () => void engine?.flush();
  const onFocus = () => {
    engine?.pullIfStale();
    for (const s of services) s.syncHooks?.onFocus?.();
  };
  const onOnline = () => void engine?.flush();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onOnline);
  const poll = setInterval(() => {
    void engine?.flush();
    for (const s of services) s.syncHooks?.onInterval?.();
  }, SYNC.pollMs);
  for (const s of services) s.syncHooks?.onStart?.();
  teardown = [
    () => {
      stopped = true;
      if (saveTimer) clearTimeout(saveTimer);
    },
    () => document.removeEventListener('visibilitychange', onVisibility),
    () => window.removeEventListener('pagehide', onPageHide),
    () => window.removeEventListener('focus', onFocus),
    () => window.removeEventListener('online', onOnline),
    () => clearInterval(poll),
    () => channel?.close(),
    () => setChangeSink(null),
  ];
}

export function syncNow() {
  void engine?.flush().then(() => {
    const s = useUi.getState().sync;
    toast(s === 'synced' ? 'Synced with Google Drive' : s === 'offline' ? 'Offline — will retry' : 'Sync needs attention');
  });
}

/** Wipe every local trace of the session (outbox, working copy, tokens, hints). */
export async function wipeLocal() {
  engine?.stop();
  engine = null;
  teardown.forEach((f) => f());
  teardown = [];
  clearTokens();
  resetDriveCache();
  useNotes.getState().reset();
  await outbox.wipeAll().catch(() => undefined);
  clearLocalHints();
}

export async function signOut() {
  try {
    await Promise.race([engine?.flush(), new Promise((r) => setTimeout(r, 3000))]);
  } catch {
    // best effort: unsynced edits are discarded on explicit sign-out
  }
  await api.logout().catch(() => undefined);
  syncChannel?.postMessage({ type: 'signout' }); // other tabs wipe their local data too
  await wipeLocal();
  location.assign('/');
}

export async function reconnectGoogle() {
  const { url } = await api.connect({ reconnect: true, return: location.pathname + location.search });
  location.assign(url);
}

export async function connectService(id: string) {
  const { url } = await api.connect({ service: id, return: location.pathname + location.search });
  location.assign(url);
}
