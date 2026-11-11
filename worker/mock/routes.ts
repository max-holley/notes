/**
 * Fake Google (OAuth consent page, Drive v3, Tasks v1, Calendar v3 subsets) for dev and tests.
 * Mounted at /__mock only when MOCK_GOOGLE=1. Shapes follow the real APIs closely enough for the client.
 */
import { Hono, type Context } from 'hono';
import { IDENTITY_SCOPES, allowedScopes, serviceManifests } from '../../src/services/registry.ts';
import { mock, mockId, resetMock, subFor, type MockEvent, type MockFile, type MockTask, type MockTaskList } from './state.ts';

const DRIVE = 'https://www.googleapis.com/auth/drive.file';
const TASKS = 'https://www.googleapis.com/auth/tasks';
const CAL = 'https://www.googleapis.com/auth/calendar.events.readonly';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const nowIso = () => new Date().toISOString();

export const mockRoutes = new Hono();

// ---------------------------------------------------------------- OAuth consent
mockRoutes.get('/oauth/authorize', (c) => {
  const q = c.req.query();
  const requested = (q.scope ?? '').split(' ').filter(Boolean);
  const hidden = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'access_type', 'include_granted_scopes', 'prompt']
    .map((k) => `<input type="hidden" name="${k}" value="${esc(q[k] ?? '')}">`).join('');
  const label = (s: string) => serviceManifests.find((m) => m.scopes.includes(s))?.label ?? s;
  const boxes = requested.filter((s) => !(IDENTITY_SCOPES as readonly string[]).includes(s))
    .map((s) => `<label style="display:block;margin:8px 0"><input type="checkbox" name="scope" value="${esc(s)}" checked> ${esc(label(s))} <small style="color:#666">${esc(s)}</small></label>`)
    .join('');
  return c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Mock Google sign-in</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px">
<h1 style="font-size:22px">Mock Google sign-in</h1>
<p>This is the in-repo fake Google used when <code>MOCK_GOOGLE=1</code>. No real account is involved.</p>
<form method="post" action="/__mock/oauth/approve">${hidden}
<label>Email <input name="email" value="alex@example.com" style="width:100%"></label><br><br>
<label>Name <input name="name" value="Alex Example" style="width:100%"></label>
<h2 style="font-size:16px">Allow access to</h2>${boxes}
<p><button type="submit" name="decision" value="allow" id="allow">Allow</button>
<button type="submit" name="decision" value="deny" id="deny">Cancel</button></p></form></body></html>`);
});

mockRoutes.post('/oauth/approve', async (c) => {
  const f = await c.req.parseBody({ all: true });
  const one = (k: string) => String(Array.isArray(f[k]) ? (f[k] as unknown[])[0] : f[k] ?? '');
  const redirect = new URL(one('redirect_uri'));
  redirect.searchParams.set('state', one('state'));
  if (one('decision') !== 'allow') {
    redirect.searchParams.set('error', 'access_denied');
    return c.redirect(redirect.toString());
  }
  const email = one('email').trim().toLowerCase() || 'alex@example.com';
  const sub = subFor(email);
  const user = mock.users.get(sub) ?? { sub, email, name: one('name') || email, consented: new Set<string>() };
  mock.users.set(sub, user);
  const ticked = ([] as unknown[]).concat(f.scope ?? []).map(String).filter((s) => allowedScopes().includes(s));
  if (one('include_granted_scopes') !== 'true') user.consented.clear();
  for (const s of [...IDENTITY_SCOPES, ...ticked]) user.consented.add(s);
  const hasLiveRefresh = [...mock.refreshTokens.values()].some((r) => r.sub === sub && !r.revoked);
  const code = mockId('mock-code-');
  mock.codes.set(code, {
    sub,
    scopes: [...user.consented],
    challenge: one('code_challenge'),
    redirectUri: one('redirect_uri'),
    issueRefresh: one('access_type') === 'offline' && (!hasLiveRefresh || one('prompt').includes('consent')),
  });
  redirect.searchParams.set('code', code);
  return c.redirect(redirect.toString());
});

// ---------------------------------------------------------------- API auth helpers
type Ctx = Context;
function authed(c: Ctx, scope: string): { sub: string } | Response {
  if (mock.apiDown) return c.json({ error: { code: 503, message: 'Backend unavailable (mock)' } }, 503);
  const token = c.req.header('Authorization')?.replace(/^Bearer /, '') ?? '';
  const t = mock.accessTokens.get(token);
  if (!t || t.exp < Date.now()) return c.json({ error: { code: 401, message: 'Invalid Credentials', status: 'UNAUTHENTICATED' } }, 401);
  if (!t.scopes.includes(scope)) return c.json({ error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED' } }, 403);
  return { sub: t.sub };
}
const isResp = (x: unknown): x is Response => x instanceof Response;

// ---------------------------------------------------------------- Drive v3
function fileMeta(f: MockFile) {
  return {
    kind: 'drive#file', id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents, appProperties: f.appProperties,
    trashed: f.trashed, modifiedTime: f.modifiedTime, headRevisionId: f.headRevisionId, size: String(f.content.length),
    webViewLink: f.mimeType === 'application/vnd.google-apps.document' ? `/__mock/docs/${f.id}` : undefined,
  };
}

/** Tiny evaluator for the Drive `q` subset the app uses. */
function matchQ(f: MockFile, q: string): boolean {
  if (!q) return true;
  return q.split(/\s+and\s+(?![^{]*})/).every((clause) => {
    clause = clause.trim();
    let m;
    if ((m = clause.match(/^trashed\s*=\s*(true|false)$/))) return f.trashed === (m[1] === 'true');
    if ((m = clause.match(/^name\s*=\s*'(.*)'$/))) return f.name === m[1]!.replace(/\\'/g, "'");
    if ((m = clause.match(/^mimeType\s*=\s*'(.*)'$/))) return f.mimeType === m[1];
    if ((m = clause.match(/^mimeType\s*!=\s*'(.*)'$/))) return f.mimeType !== m[1];
    if ((m = clause.match(/^'(.*)'\s+in\s+parents$/))) return f.parents.includes(m[1]!);
    if ((m = clause.match(/^appProperties\s+has\s+\{\s*key\s*=\s*'(.*?)'\s+and\s+value\s*=\s*'(.*?)'\s*\}$/))) return f.appProperties[m[1]!] === m[2];
    return false;
  });
}

function touch(f: MockFile) {
  f.modifiedTime = nowIso();
  f.headRevisionId = mockId('rev-');
}

function newFile(sub: string, meta: Partial<MockFile>, content = new Uint8Array(), contentType = 'application/octet-stream'): MockFile {
  const f: MockFile = {
    id: mockId('file-'), owner: sub, name: meta.name ?? 'Untitled', mimeType: meta.mimeType ?? contentType,
    parents: meta.parents ?? ['root'], appProperties: meta.appProperties ?? {}, trashed: false,
    modifiedTime: nowIso(), headRevisionId: mockId('rev-'), content, contentType,
  };
  mock.files.set(f.id, f);
  return f;
}

/** Parse a text multipart/related body: first part JSON metadata, second part media. */
function parseMultipart(body: string, contentType: string): { meta: Partial<MockFile>; media: string; mediaType: string } {
  const boundary = contentType.match(/boundary=("?)([^";]+)\1/)?.[2] ?? '';
  const parts = body.split(`--${boundary}`).slice(1, -1).map((p) => {
    const idx = p.indexOf('\r\n\r\n');
    const head = p.slice(0, idx);
    return { type: head.match(/content-type:\s*([^\r\n;]+)/i)?.[1] ?? '', body: p.slice(idx + 4).replace(/\r\n$/, '') };
  });
  return { meta: JSON.parse(parts[0]?.body ?? '{}') as Partial<MockFile>, media: parts[1]?.body ?? '', mediaType: parts[1]?.type ?? 'text/plain' };
}

function ownFile(c: Ctx, sub: string): MockFile | Response {
  const f = mock.files.get(c.req.param('id') ?? '');
  if (!f || f.owner !== sub) return c.json({ error: { code: 404, message: 'File not found' } }, 404);
  return f;
}

mockRoutes.get('/googleapis/drive/v3/files', (c) => {
  const a = authed(c, DRIVE); if (isResp(a)) return a;
  const q = c.req.query('q') ?? '';
  const files = [...mock.files.values()].filter((f) => f.owner === a.sub && matchQ(f, q)).map(fileMeta);
  return c.json({ kind: 'drive#fileList', files });
});

mockRoutes.post('/googleapis/drive/v3/files', async (c) => {
  const a = authed(c, DRIVE); if (isResp(a)) return a;
  const meta = (await c.req.json()) as Partial<MockFile>;
  return c.json(fileMeta(newFile(a.sub, meta, new Uint8Array(), meta.mimeType ?? 'application/octet-stream')));
});

mockRoutes.post('/googleapis/upload/drive/v3/files', async (c) => {
  const a = authed(c, DRIVE); if (isResp(a)) return a;
  const type = c.req.header('Content-Type') ?? '';
  if (c.req.query('uploadType') === 'multipart') {
    const { meta, media, mediaType } = parseMultipart(await c.req.text(), type);
    return c.json(fileMeta(newFile(a.sub, meta, new TextEncoder().encode(media), mediaType)));
  }
  return c.json(fileMeta(newFile(a.sub, {}, new Uint8Array(await c.req.arrayBuffer()), type)));
});

mockRoutes.patch('/googleapis/upload/drive/v3/files/:id', async (c) => {
  const a = authed(c, DRIVE); if (isResp(a)) return a;
  const f = ownFile(c, a.sub); if (isResp(f)) return f;
  const type = c.req.header('Content-Type') ?? '';
  if (c.req.query('uploadType') === 'multipart') {
    const { meta, media, mediaType } = parseMultipart(await c.req.text(), type);
    Object.assign(f, { name: meta.name ?? f.name, appProperties: { ...f.appProperties, ...meta.appProperties } });
    f.content = new TextEncoder().encode(media); f.contentType = mediaType;
  } else {
    f.content = new Uint8Array(await c.req.arrayBuffer()); f.contentType = type;
  }
  touch(f);
  return c.json(fileMeta(f));
});

mockRoutes.get('/googleapis/drive/v3/files/:id', (c) => {
  const a = authed(c, DRIVE); if (isResp(a)) return a;
  const f = ownFile(c, a.sub); if (isResp(f)) return f;
  if (c.req.query('alt') === 'media') {
    return new Response(f.content, { headers: { 'Content-Type': f.contentType, 'X-Goog-Revision': f.headRevisionId } });
  }
  return c.json(fileMeta(f));
});

mockRoutes.patch('/googleapis/drive/v3/files/:id', async (c) => {
  const a = authed(c, DRIVE); if (isResp(a)) return a;
  const f = ownFile(c, a.sub); if (isResp(f)) return f;
  const meta = (await c.req.json()) as Partial<MockFile>;
  if (meta.name !== undefined) f.name = meta.name;
  if (meta.trashed !== undefined) f.trashed = meta.trashed;
  if (meta.appProperties) f.appProperties = { ...f.appProperties, ...meta.appProperties };
  touch(f);
  return c.json(fileMeta(f));
});

mockRoutes.delete('/googleapis/drive/v3/files/:id', (c) => {
  const a = authed(c, DRIVE); if (isResp(a)) return a;
  const f = ownFile(c, a.sub); if (isResp(f)) return f;
  mock.files.delete(f.id);
  return c.body(null, 204);
});

mockRoutes.get('/docs/:id', (c) => {
  const f = mock.files.get(c.req.param('id'));
  if (!f) return c.text('Not found', 404);
  return c.html(`<!doctype html><title>${esc(f.name)} - Mock Docs</title><h1>${esc(f.name)}</h1><div id="doc">${new TextDecoder().decode(f.content)}</div>`);
});

// ---------------------------------------------------------------- Tasks v1
function lists(sub: string) {
  let m = mock.taskLists.get(sub);
  if (!m) mock.taskLists.set(sub, (m = new Map()));
  return m;
}
const listJson = (l: MockTaskList) => ({ kind: 'tasks#taskList', id: l.id, title: l.title, updated: l.updated });
const taskJson = (t: MockTask) => ({ kind: 'tasks#task', ...t });
function getList(c: Ctx, sub: string): MockTaskList | Response {
  const l = lists(sub).get(c.req.param('list') ?? '');
  return l ?? c.json({ error: { code: 404, message: 'Task list not found' } }, 404);
}
function applyTaskPatch(t: MockTask, p: Partial<MockTask>) {
  if (p.title !== undefined) t.title = p.title;
  if (p.notes !== undefined) t.notes = p.notes;
  if (p.due !== undefined) t.due = p.due ?? undefined;
  if (p.status !== undefined) {
    t.status = p.status;
    t.completed = p.status === 'completed' ? nowIso() : undefined;
  }
  t.updated = nowIso();
}

mockRoutes.get('/googleapis/tasks/v1/users/@me/lists', (c) => {
  const a = authed(c, TASKS); if (isResp(a)) return a;
  return c.json({ kind: 'tasks#taskLists', items: [...lists(a.sub).values()].map(listJson) });
});
mockRoutes.post('/googleapis/tasks/v1/users/@me/lists', async (c) => {
  const a = authed(c, TASKS); if (isResp(a)) return a;
  const body = (await c.req.json()) as { title: string };
  const l: MockTaskList = { id: mockId('list-'), title: body.title, updated: nowIso(), tasks: new Map() };
  lists(a.sub).set(l.id, l);
  return c.json(listJson(l));
});
mockRoutes.get('/googleapis/tasks/v1/lists/:list/tasks', (c) => {
  const a = authed(c, TASKS); if (isResp(a)) return a;
  const l = getList(c, a.sub); if (isResp(l)) return l;
  const showCompleted = c.req.query('showCompleted') !== 'false';
  const items = [...l.tasks.values()].filter((t) => !t.deleted && (showCompleted || t.status !== 'completed')).map(taskJson);
  return c.json({ kind: 'tasks#tasks', items });
});
mockRoutes.post('/googleapis/tasks/v1/lists/:list/tasks', async (c) => {
  const a = authed(c, TASKS); if (isResp(a)) return a;
  const l = getList(c, a.sub); if (isResp(l)) return l;
  const body = (await c.req.json()) as Partial<MockTask>;
  const t: MockTask = { id: mockId('task-'), title: '', status: 'needsAction', updated: nowIso(), position: String(l.tasks.size).padStart(8, '0') };
  applyTaskPatch(t, body);
  l.tasks.set(t.id, t);
  return c.json(taskJson(t));
});
mockRoutes.get('/googleapis/tasks/v1/lists/:list/tasks/:task', (c) => {
  const a = authed(c, TASKS); if (isResp(a)) return a;
  const l = getList(c, a.sub); if (isResp(l)) return l;
  const t = l.tasks.get(c.req.param('task'));
  return t && !t.deleted ? c.json(taskJson(t)) : c.json({ error: { code: 404, message: 'Task not found' } }, 404);
});
mockRoutes.patch('/googleapis/tasks/v1/lists/:list/tasks/:task', async (c) => {
  const a = authed(c, TASKS); if (isResp(a)) return a;
  const l = getList(c, a.sub); if (isResp(l)) return l;
  const t = l.tasks.get(c.req.param('task'));
  if (!t || t.deleted) return c.json({ error: { code: 404, message: 'Task not found' } }, 404);
  applyTaskPatch(t, (await c.req.json()) as Partial<MockTask>);
  return c.json(taskJson(t));
});
mockRoutes.delete('/googleapis/tasks/v1/lists/:list/tasks/:task', (c) => {
  const a = authed(c, TASKS); if (isResp(a)) return a;
  const l = getList(c, a.sub); if (isResp(l)) return l;
  const t = l.tasks.get(c.req.param('task'));
  if (t) t.deleted = true;
  return c.body(null, 204);
});

// ---------------------------------------------------------------- Calendar v3 (read-only)
const pad = (n: number) => String(n).padStart(2, '0');
function eventsForDay(sub: string, day: Date): MockEvent[] {
  const ymd = `${day.getUTCFullYear()}${pad(day.getUTCMonth() + 1)}${pad(day.getUTCDate())}`;
  const at = (h: number, m: number) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m)).toISOString();
  const base: [string, number, number, number][] = [['Team stand-up', 9, 30, 15], ['Project review', 13, 0, 60], ['1:1 with Sam', 16, 0, 30]];
  return base.map(([summary, h, m, len], i) => {
    const id = `evt${ymd}${i + 1}`;
    const start = at(h, m);
    return {
      id, summary, start: { dateTime: start }, end: { dateTime: new Date(Date.parse(start) + len * 60000).toISOString() },
      attendees: [{ email: 'sam@example.com', displayName: 'Sam Lee', responseStatus: 'accepted' }, { email: 'kim@example.com', displayName: 'Kim Park', responseStatus: 'needsAction' }],
      hangoutLink: `https://meet.google.com/${id.slice(-6)}-mock`, htmlLink: `https://calendar.google.com/calendar/event?eid=${id}`,
      description: `Mock event for ${sub}`, updated: start,
    };
  });
}
function eventOverrides(id: string, e: MockEvent, sub: string): MockEvent {
  const extra = (mock.extraEvents.get(sub) ?? []).find((x) => x.id === id);
  return extra ? { ...e, ...extra } : e;
}
function allEvents(sub: string, min: Date, max: Date): MockEvent[] {
  const out: MockEvent[] = [];
  for (let d = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), min.getUTCDate())); d < max; d = new Date(d.getTime() + 86400000)) {
    out.push(...eventsForDay(sub, d).map((e) => eventOverrides(e.id, e, sub)));
  }
  for (const e of mock.extraEvents.get(sub) ?? []) if (!out.some((o) => o.id === e.id) && e.start?.dateTime) out.push(e);
  return out.filter((e) => Date.parse(e.end.dateTime) > min.getTime() && Date.parse(e.start.dateTime) < max.getTime())
    .sort((a, b) => a.start.dateTime.localeCompare(b.start.dateTime));
}
mockRoutes.get('/googleapis/calendar/v3/calendars/:cal/events', (c) => {
  const a = authed(c, CAL); if (isResp(a)) return a;
  const min = new Date(c.req.query('timeMin') ?? Date.now());
  const max = new Date(c.req.query('timeMax') ?? Date.now() + 86400000);
  return c.json({ kind: 'calendar#events', items: allEvents(a.sub, min, max) });
});
mockRoutes.get('/googleapis/calendar/v3/calendars/:cal/events/:id', (c) => {
  const a = authed(c, CAL); if (isResp(a)) return a;
  const id = c.req.param('id');
  const m = id.match(/^evt(\d{4})(\d{2})(\d{2})\d$/);
  const day = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : new Date();
  const e = allEvents(a.sub, day, new Date(day.getTime() + 86400000)).find((x) => x.id === id)
    ?? (mock.extraEvents.get(a.sub) ?? []).find((x) => x.id === id);
  return e ? c.json(e) : c.json({ error: { code: 404, message: 'Not Found' } }, 404);
});

// ---------------------------------------------------------------- Test control (mock only)
mockRoutes.post('/control/reset', (c) => { resetMock(); return c.json({ ok: true }); });
mockRoutes.post('/control/api-down', async (c) => { mock.apiDown = ((await c.req.json()) as { down: boolean }).down; return c.json({ ok: true }); });
mockRoutes.post('/control/expire-access-tokens', (c) => { for (const t of mock.accessTokens.values()) t.exp = 0; return c.json({ ok: true }); });
mockRoutes.post('/control/revoke', async (c) => {
  const { email } = (await c.req.json()) as { email: string };
  for (const r of mock.refreshTokens.values()) if (r.sub === subFor(email)) r.revoked = true;
  for (const [k, t] of mock.accessTokens) if (t.sub === subFor(email)) mock.accessTokens.delete(k);
  return c.json({ ok: true });
});
mockRoutes.get('/control/files', (c) => {
  const sub = subFor(c.req.query('email') ?? 'alex@example.com');
  return c.json([...mock.files.values()].filter((f) => f.owner === sub).map((f) => ({
    ...fileMeta(f), contentType: f.contentType, text: /json|text|html/.test(f.contentType) ? new TextDecoder().decode(f.content) : undefined,
  })));
});
mockRoutes.get('/control/tasks', (c) => {
  const sub = subFor(c.req.query('email') ?? 'alex@example.com');
  return c.json([...lists(sub).values()].map((l) => ({ ...listJson(l), tasks: [...l.tasks.values()] })));
});
mockRoutes.patch('/control/tasks/:id', async (c) => {
  const patch = (await c.req.json()) as Partial<MockTask>;
  for (const ls of mock.taskLists.values()) for (const l of ls.values()) {
    const t = l.tasks.get(c.req.param('id'));
    if (t) { applyTaskPatch(t, patch); return c.json(t); }
  }
  return c.json({ error: 'not found' }, 404);
});
mockRoutes.post('/control/events', async (c) => {
  const { email, event } = (await c.req.json()) as { email?: string; event: MockEvent };
  const sub = subFor(email ?? 'alex@example.com');
  const list = mock.extraEvents.get(sub) ?? [];
  mock.extraEvents.set(sub, [...list.filter((e) => e.id !== event.id), event]);
  return c.json({ ok: true });
});
