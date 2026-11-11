import type { NotesDoc } from '../data/model.ts';
import type { Change } from './merge.ts';

/**
 * Temporary local storage only: an outbox of unsynced changes + the session working copy.
 * Entries are removed once Drive confirms. Everything is wiped on sign-out/disconnect.
 */
const DB_NAME = 'notes-local';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('working')) db.createObjectStore('working');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= open());

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve((req ? req.result : undefined) as T);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export interface OutboxLike {
  put(changes: Change[]): Promise<void>;
  all(): Promise<Change[]>;
  /** Remove entries that were confirmed (only if not superseded by a newer edit). */
  confirm(pushed: Change[]): Promise<void>;
}

export const outbox: OutboxLike & {
  clear(): Promise<void>;
  saveWorking(userId: string, doc: NotesDoc): Promise<void>;
  loadWorking(userId: string): Promise<NotesDoc | null>;
  wipeAll(): Promise<void>;
} = {
  async put(changes) {
    await tx('outbox', 'readwrite', (s) => {
      for (const c of changes) s.put(c);
    });
  },
  all: () => tx<Change[]>('outbox', 'readonly', (s) => s.getAll() as IDBRequest<Change[]>),
  async confirm(pushed) {
    const current = new Map((await outbox.all()).map((c) => [c.key, c]));
    await tx('outbox', 'readwrite', (s) => {
      for (const p of pushed) if (current.get(p.key)?.at === p.at) s.delete(p.key);
    });
  },
  clear: () => tx('outbox', 'readwrite', (s) => s.clear()),
  async saveWorking(userId, doc) {
    await tx('working', 'readwrite', (s) => s.put({ userId, doc }, 'doc'));
  },
  async loadWorking(userId) {
    const v = await tx<{ userId: string; doc: NotesDoc } | undefined>('working', 'readonly', (s) => s.get('doc'));
    return v && v.userId === userId ? v.doc : null;
  },
  async wipeAll() {
    await Promise.all([tx('outbox', 'readwrite', (s) => s.clear()), tx('working', 'readwrite', (s) => s.clear())]);
  },
};
