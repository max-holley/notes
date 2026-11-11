import { describe, expect, it, vi } from 'vitest';
import { emptyDoc, TOMBSTONE_TTL_MS, TRASH_TTL_MS, type Note, type NotesDoc } from '../data/model.ts';
import { backoffDelay, ConflictError, ReconnectRequiredError, SYNC, SyncEngine, TransientError, type Timers, type Transport } from './engine.ts';
import { applyChanges, mergeDocs, migratePrefs, normalizeDoc, type Change } from './merge.ts';
import { outbox, type OutboxLike } from './outbox.ts';

const note = (id: string, updatedAt: number, extra: Partial<Note> = {}): Note => ({
  id, title: id, body: '', categoryId: null, tags: [], pinned: false, archived: false, createdAt: 0, editedAt: updatedAt, updatedAt, ...extra,
});
const docWith = (...notes: Note[]): NotesDoc => {
  const d = emptyDoc();
  for (const n of notes) d.notes[n.id] = n;
  return d;
};

describe('merge', () => {
  it('per-item last-writer-wins', () => {
    const a = docWith(note('x', 10, { title: 'A' }), note('y', 5));
    const b = docWith(note('x', 20, { title: 'B' }), note('z', 1));
    const m = mergeDocs(a, b, 100);
    expect(m.notes.x!.title).toBe('B');
    expect(Object.keys(m.notes).sort()).toEqual(['x', 'y', 'z']);
    expect(mergeDocs(b, a, 100)).toEqual(m);
  });

  it('tombstones prevent resurrection from stale devices', () => {
    const stale = docWith(note('x', 10));
    const deleted = emptyDoc();
    deleted.tombstones['note:x'] = { kind: 'note', deletedAt: 15 };
    expect(mergeDocs(stale, deleted, 100).notes.x).toBeUndefined();
    expect(mergeDocs(deleted, stale, 100).notes.x).toBeUndefined();
  });

  it('an edit newer than the tombstone wins', () => {
    const edited = docWith(note('x', 20));
    const deleted = emptyDoc();
    deleted.tombstones['note:x'] = { kind: 'note', deletedAt: 15 };
    expect(mergeDocs(edited, deleted, 100).notes.x).toBeDefined();
  });

  it('expires tombstones after 90 days and trash after 30 days', () => {
    const d = docWith(note('t', 1, { trashedAt: 1 }));
    d.tombstones['note:old'] = { kind: 'note', deletedAt: 1 };
    const now = 2 + TOMBSTONE_TTL_MS;
    const m = mergeDocs(d, emptyDoc(), now);
    expect(m.tombstones['note:old']).toBeUndefined();
    expect(m.notes.t).toBeUndefined();
    expect(m.tombstones['note:t']).toBeDefined();
    const fresh = mergeDocs(docWith(note('t', 1, { trashedAt: 10 })), emptyDoc(), 10 + TRASH_TTL_MS - 1);
    expect(fresh.notes.t).toBeDefined();
  });

  it('merges prefs by updatedAt', () => {
    const a = emptyDoc();
    a.prefs = { ...a.prefs, font: 'inter', updatedAt: 5 };
    const b = emptyDoc();
    b.prefs = { ...b.prefs, font: 'lato', updatedAt: 9 };
    expect(mergeDocs(a, b).prefs.font).toBe('lato');
  });

  it('applies outbox changes on top of the pulled doc', () => {
    const remote = docWith(note('a', 10), note('b', 10));
    const changes: Change[] = [
      { key: 'notes:a', col: 'notes', id: 'a', value: note('a', 20, { title: 'edited' }), at: 20 },
      { key: 'notes:b', col: 'notes', id: 'b', value: null, at: Date.now() },
    ];
    const d = applyChanges(remote, changes);
    expect(d.notes.a!.title).toBe('edited');
    expect(d.notes.b).toBeUndefined();
    expect(d.tombstones['note:b']).toBeDefined();
  });
});

describe('prefs migration', () => {
  it('maps legacy values and fills defaults', () => {
    const p = migratePrefs({ theme: 'auto', accentIdx: 0, bogus: 1, sidebar: { tags: false } });
    expect(p.theme).toBe('system');
    expect(p.accent).toBe('indigo');
    expect(p.sidebar).toEqual({ categories: true, tags: false, today: true });
    expect(p).not.toHaveProperty('bogus');
    expect(migratePrefs(null).sort).toBe('updated');
    expect(normalizeDoc({ notes: {} } as Partial<NotesDoc>).taskLinks).toEqual({});
  });
});

describe('outbox (IndexedDB)', () => {
  it('keeps only the latest change per item and confirms without dropping newer edits', async () => {
    await outbox.clear();
    const c1: Change = { key: 'notes:a', col: 'notes', id: 'a', value: note('a', 1), at: 1 };
    const c2: Change = { key: 'notes:a', col: 'notes', id: 'a', value: note('a', 2), at: 2 };
    await outbox.put([c1]);
    const snapshot = await outbox.all();
    await outbox.put([c2]);
    await outbox.confirm(snapshot);
    expect(await outbox.all()).toEqual([c2]);
    await outbox.confirm([c2]);
    expect(await outbox.all()).toEqual([]);
  });

  it('wipes everything', async () => {
    await outbox.put([{ key: 'notes:a', col: 'notes', id: 'a', value: note('a', 1), at: 1 }]);
    await outbox.saveWorking('u1', emptyDoc());
    expect(await outbox.loadWorking('u1')).not.toBeNull();
    expect(await outbox.loadWorking('u2')).toBeNull();
    await outbox.wipeAll();
    expect(await outbox.all()).toEqual([]);
    expect(await outbox.loadWorking('u1')).toBeNull();
  });
});

class FakeTimers implements Timers {
  t = 0;
  q: { at: number; fn: () => void; id: number }[] = [];
  n = 0;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.n;
    this.q.push({ at: this.t + ms, fn, id });
    return id;
  };
  clearTimeout = (h: unknown) => {
    this.q = this.q.filter((x) => x.id !== h);
  };
  async advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.q.sort((a, b) => a.at - b.at);
      const next = this.q[0];
      if (!next || next.at > end) break;
      this.q.shift();
      this.t = next.at;
      next.fn();
      await flushPromises();
    }
    this.t = end;
  }
}
const flushPromises = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function memOutbox(): OutboxLike & { items: Map<string, Change> } {
  const items = new Map<string, Change>();
  return {
    items,
    put: async (cs) => cs.forEach((c) => items.set(c.key, c)),
    all: async () => [...items.values()],
    confirm: async (cs) => cs.forEach((c) => items.get(c.key)?.at === c.at && items.delete(c.key)),
  };
}

function setup(transport: Partial<Transport> = {}) {
  const timers = new FakeTimers();
  let remote: NotesDoc | null = null;
  let local = emptyDoc();
  const statuses: string[] = [];
  const t: Transport = {
    pull: vi.fn(async () => ({ doc: remote && structuredClone(remote), rev: remote ? 'r' : null })),
    push: vi.fn(async (doc: NotesDoc) => {
      remote = structuredClone(doc);
      return { rev: 'r2' };
    }),
    ...transport,
  };
  const box = memOutbox();
  const engine = new SyncEngine({
    transport: t,
    outbox: box,
    getLocal: () => local,
    applyRemote: (d) => (local = mergeDocs(local, d)),
    onStatus: (s) => statuses.push(s),
    timers,
  });
  return {
    engine, timers, t, box, statuses,
    edit(n: Note) {
      local = mergeDocs(local, docWith(n));
      void box.put([{ key: `notes:${n.id}`, col: 'notes', id: n.id, value: n, at: n.updatedAt }]);
      engine.schedule();
    },
    get remote() { return remote; },
    set remote(d) { remote = d; },
    get local() { return local; },
  };
}

describe('sync engine', () => {
  it('debounces 3 s and pushes once', async () => {
    const s = setup();
    s.edit(note('a', 1));
    await s.timers.advance(1000);
    s.edit(note('a', 2));
    await s.timers.advance(2999);
    expect(s.t.push).not.toHaveBeenCalled();
    await s.timers.advance(1);
    expect(s.t.push).toHaveBeenCalledTimes(1);
    expect(s.remote!.notes.a!.updatedAt).toBe(2);
    expect(s.statuses.at(-1)).toBe('synced');
    expect(s.box.items.size).toBe(0);
  });

  it('forces a push after 20 s of continuous typing', async () => {
    const s = setup();
    for (let i = 1; i <= 25; i++) {
      s.edit(note('a', i));
      await s.timers.advance(1000);
    }
    expect(s.t.push).toHaveBeenCalled();
    expect((s.t.push as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('read-merge-writes against the latest remote', async () => {
    const s = setup();
    s.remote = docWith(note('remote', 5));
    s.edit(note('local', 6));
    await s.engine.flush();
    expect(Object.keys(s.remote!.notes).sort()).toEqual(['local', 'remote']);
    expect(Object.keys(s.local.notes).sort()).toEqual(['local', 'remote']);
  });

  it('keeps one request in flight and re-runs once after', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const pull = vi.fn(async () => {
      await gate;
      return { doc: null, rev: null };
    });
    const s = setup({ pull });
    s.edit(note('a', 1));
    const p1 = s.engine.flush();
    void s.engine.flush();
    void s.engine.flush();
    await flushPromises();
    expect(pull).toHaveBeenCalledTimes(1);
    release();
    await p1;
    await flushPromises();
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it('backs off 5 s → 60 s on transient errors and goes offline', async () => {
    expect([0, 1, 2, 3, 4, 5].map(backoffDelay)).toEqual([5000, 10000, 20000, 40000, 60000, 60000]);
    let fail = true;
    const pull = vi.fn(async () => {
      if (fail) throw new TransientError('network');
      return { doc: null, rev: null };
    });
    const s = setup({ pull });
    s.edit(note('a', 1));
    await s.engine.flush();
    expect(s.statuses.at(-1)).toBe('offline');
    await s.timers.advance(SYNC.backoffMinMs - 1);
    expect(pull).toHaveBeenCalledTimes(1);
    await s.timers.advance(1);
    expect(pull).toHaveBeenCalledTimes(2);
    fail = false;
    await s.timers.advance(10_000);
    expect(s.statuses.at(-1)).toBe('synced');
    expect(s.box.items.size).toBe(0);
  });

  it('stops and asks to reconnect when the grant is revoked, keeping edits queued', async () => {
    const pull = vi.fn(async () => {
      throw new ReconnectRequiredError();
    });
    const s = setup({ pull });
    s.edit(note('a', 1));
    await s.engine.flush();
    expect(s.statuses.at(-1)).toBe('reconnect');
    await s.timers.advance(120_000);
    expect(pull).toHaveBeenCalledTimes(1);
    expect(s.box.items.size).toBe(1);
  });

  it('re-runs read-merge-write immediately when the remote changed between pull and push', async () => {
    let first = true;
    const s = setup();
    const push = vi.fn(async () => {
      if (first) {
        first = false;
        throw new ConflictError('moved');
      }
      return { rev: 'r3' };
    });
    (s.t as unknown as { push: typeof push }).push = push;
    s.edit(note('a', 1));
    await s.engine.flush();
    await flushPromises();
    expect(push).toHaveBeenCalledTimes(2);
    expect(s.statuses.at(-1)).toBe('synced');
  });

  it('pulls on focus only when stale', async () => {
    const s = setup();
    await s.engine.flush();
    s.engine.pullIfStale();
    await flushPromises();
    expect(s.t.pull).toHaveBeenCalledTimes(1);
    await s.timers.advance(SYNC.staleMs + 1);
    s.engine.pullIfStale();
    await flushPromises();
    expect(s.t.pull).toHaveBeenCalledTimes(2);
  });
});
