import type { NotesDoc } from '../data/model.ts';
import { mergeDocs } from './merge.ts';
import type { OutboxLike } from './outbox.ts';

export type SyncStatus = 'idle' | 'synced' | 'saving' | 'offline' | 'reconnect' | 'error';

export const SYNC = {
  debounceMs: 3_000,
  maxWaitMs: 20_000,
  backoffMinMs: 5_000,
  backoffMaxMs: 60_000,
  staleMs: 30_000,
  pollMs: 5 * 60_000,
  warnBytes: 40 * 1024 * 1024,
};

export class ReconnectRequiredError extends Error {
  constructor() {
    super('Google connection needs to be renewed');
  }
}
/** Network failure or 5xx/429: retry with backoff. */
export class TransientError extends Error {}

export interface Transport {
  pull(): Promise<{ doc: NotesDoc | null; rev: string | null }>;
  push(doc: NotesDoc, baseRev: string | null): Promise<{ rev: string }>;
}

export interface Timers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}
const realTimers: Timers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as number),
};

export interface EngineDeps {
  transport: Transport;
  outbox: OutboxLike;
  getLocal(): NotesDoc;
  /** Merge a remote-derived doc into local state. */
  applyRemote(doc: NotesDoc): void;
  onStatus(s: SyncStatus, info?: { error?: unknown; retryInMs?: number }): void;
  onSizeWarning?(bytes: number): void;
  /** Cross-tab mutual exclusion (navigator.locks in the browser). */
  lock?<T>(fn: () => Promise<T>): Promise<T>;
  timers?: Timers;
}

/** Backoff schedule: 5 s, 10 s, 20 s, 40 s, 60 s, 60 s… */
export const backoffDelay = (failures: number) => Math.min(SYNC.backoffMaxMs, SYNC.backoffMinMs * 2 ** failures);

/**
 * Sync engine: debounce 3 s / max-wait 20 s, one request in flight, exponential backoff 5–60 s,
 * read-merge-write against the latest remote before every push.
 */
export class SyncEngine {
  status: SyncStatus = 'idle';
  lastSyncAt = 0;
  rev: string | null = null;
  private t: Timers;
  private debounce: unknown = null;
  private firstPendingAt: number | null = null;
  private retryTimer: unknown = null;
  private failures = 0;
  private inFlight: Promise<void> | null = null;
  private again = false;
  private stopped = false;

  constructor(private d: EngineDeps) {
    this.t = d.timers ?? realTimers;
  }

  private set(s: SyncStatus, info?: { error?: unknown; retryInMs?: number }) {
    this.status = s;
    this.d.onStatus(s, info);
  }

  /** Call after every local change. */
  schedule() {
    if (this.stopped) return;
    const now = this.t.now();
    this.firstPendingAt ??= now;
    if (this.status !== 'reconnect' && this.status !== 'offline') this.set('saving');
    if (this.status === 'reconnect') return;
    if (this.debounce) this.t.clearTimeout(this.debounce);
    const wait = Math.max(0, Math.min(SYNC.debounceMs, this.firstPendingAt + SYNC.maxWaitMs - now));
    this.debounce = this.t.setTimeout(() => void this.flush(), wait);
  }

  /** Sync right now (Ctrl+S, pagehide, visibilitychange). */
  flush(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.debounce) this.t.clearTimeout(this.debounce);
    this.debounce = null;
    if (this.retryTimer) this.t.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.inFlight) {
      this.again = true;
      return this.inFlight;
    }
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
      if (this.again && !this.stopped) {
        this.again = false;
        void this.flush();
      }
    });
    return this.inFlight;
  }

  /** Pull on focus if the last sync is older than 30 s. */
  pullIfStale() {
    if (this.t.now() - this.lastSyncAt > SYNC.staleMs) void this.flush();
  }

  get inFlightNow() {
    return this.inFlight !== null;
  }

  stop() {
    this.stopped = true;
    if (this.debounce) this.t.clearTimeout(this.debounce);
    if (this.retryTimer) this.t.clearTimeout(this.retryTimer);
  }

  /** Called after the user reconnects Google. */
  resume() {
    this.failures = 0;
    void this.flush();
  }

  private async run() {
    const lock = this.d.lock ?? (<T,>(fn: () => Promise<T>) => fn());
    this.firstPendingAt = null;
    try {
      await lock(async () => {
        const pending = await this.d.outbox.all();
        const remote = await this.d.transport.pull();
        const local = this.d.getLocal();
        const merged = remote.doc ? mergeDocs(remote.doc, local, this.t.now()) : local;
        const changed = !remote.doc || JSON.stringify(merged) !== JSON.stringify(remote.doc);
        if (changed) {
          const json = JSON.stringify(merged);
          if (json.length > SYNC.warnBytes) this.d.onSizeWarning?.(json.length);
          this.rev = (await this.d.transport.push(merged, remote.rev)).rev;
        } else {
          this.rev = remote.rev;
        }
        this.d.applyRemote(merged);
        await this.d.outbox.confirm(pending);
      });
      this.failures = 0;
      this.lastSyncAt = this.t.now();
      if (!this.again) this.set('synced');
    } catch (error) {
      if (error instanceof ReconnectRequiredError) {
        this.set('reconnect', { error });
        return;
      }
      const delay = backoffDelay(this.failures);
      this.failures++;
      this.set(error instanceof TransientError ? 'offline' : 'error', { error, retryInMs: delay });
      if (!this.stopped) this.retryTimer = this.t.setTimeout(() => void this.flush(), delay);
    }
  }
}
