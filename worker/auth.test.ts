import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { RATE_LIMIT, resetRateLimits, safeReturn, tokenCache, deviceLabel } from './app.ts';
import { b64encode, decrypt, encrypt, loadKeyRing, pkceChallenge, randomBytes, seal, sha256, unseal } from './crypto.ts';
import { mockOAuth } from './mock/oauth.ts';
import { mock, resetMock } from './mock/state.ts';
import { Jar, req, signIn } from './test/helpers.ts';

const CAL = 'https://www.googleapis.com/auth/calendar.events.readonly';
const DRIVE = 'https://www.googleapis.com/auth/drive.file';
const TASKS = 'https://www.googleapis.com/auth/tasks';

beforeEach(async () => {
  resetMock();
  resetRateLimits();
  tokenCache.clear();
  await env.DB.batch([env.DB.prepare('DELETE FROM sessions'), env.DB.prepare('DELETE FROM grants'), env.DB.prepare('DELETE FROM users')]);
});

describe('OAuth start + PKCE', () => {
  it('builds a Google URL with S256 PKCE, offline access, incremental scopes and sealed state', async () => {
    const { authUrl, start } = await signIn();
    expect(start.status).toBe(302);
    const p = authUrl.searchParams;
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get('access_type')).toBe('offline');
    expect(p.get('include_granted_scopes')).toBe('true');
    expect(p.get('scope')!.split(' ')).toEqual(expect.arrayContaining(['openid', DRIVE, TASKS, CAL]));
    // The verifier is not visible in the state (it is encrypted).
    expect(p.get('state')).not.toContain('"v"');
  });

  it('completes sign-in, creates a hashed session and redirects to the deep link', async () => {
    const { done, jar } = await signIn({ returnTo: '/app?note=abc' });
    expect(done.status).toBe(302);
    expect(done.headers.get('Location')).toBe('/app?note=abc');
    const sid = jar.cookies.get('sid')!;
    expect(sid).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await env.DB.prepare('SELECT id_hash FROM sessions').first<{ id_hash: string }>();
    expect(row!.id_hash).toBe(await sha256(sid));
    expect(row!.id_hash).not.toBe(sid);
    const setCookie = done.headers.getSetCookie().find((c) => c.startsWith('sid='))!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Secure/i);
    const me = await (await req('/api/me', { jar })).json<{ user: { email: string }; services: string[] }>();
    expect(me.user.email).toBe('alex@example.com');
    expect(me.services).toEqual(['drive', 'tasks', 'calendar']);
  });

  it('rejects a wrong PKCE verifier at the token endpoint', async () => {
    const client = mockOAuth('http://x');
    mock.users.set('s', { sub: 's', email: 'a@b.c', name: 'A', consented: new Set(['openid']) });
    mock.codes.set('c1', { sub: 's', scopes: ['openid'], challenge: await pkceChallenge('right'), redirectUri: 'r', issueRefresh: true });
    await expect(client.exchangeCode('c1', 'wrong', 'r')).rejects.toThrow(/PKCE/);
  });

  it('only allows same-origin relative return paths', () => {
    expect(safeReturn('/app?note=1')).toBe('/app?note=1');
    expect(safeReturn('//evil.com')).toBe('/app');
    expect(safeReturn('https://evil.com')).toBe('/app');
    expect(safeReturn('/\\evil.com')).toBe('/app');
    expect(safeReturn('/\t/evil.com')).toBe('/app');
    expect(safeReturn('/\n/evil.com')).toBe('/app');
    expect(safeReturn('/app?note=a#x')).toBe('/app?note=a#x');
  });

  it('rejects a connect flow completed with a different Google account', async () => {
    const { jar } = await signIn({ email: 'owner@example.com', untick: [CAL] });
    const res = await req('/api/services/connect', { method: 'POST', jar, csrf: true, body: JSON.stringify({ service: 'calendar' }), headers: { 'Content-Type': 'application/json' } });
    const { url } = await res.json<{ url: string }>();
    const p = new URL(url).searchParams;
    expect(p.get('login_hint')).toBe('owner@example.com');
    const form = new URLSearchParams();
    for (const k of ['client_id', 'redirect_uri', 'state', 'code_challenge', 'access_type', 'include_granted_scopes', 'prompt']) form.set(k, p.get(k) ?? '');
    form.set('email', 'other@example.com');
    form.set('decision', 'allow');
    for (const s of (p.get('scope') ?? '').split(' ')) form.append('scope', s);
    const approve = await req('/__mock/oauth/approve', { method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const cb = new URL(approve.headers.get('Location')!);
    const done = await req(cb.pathname + cb.search, { jar });
    expect(done.headers.get('Location')).toContain('auth_error=account_mismatch');
    const me = await (await req('/api/me', { jar })).json<{ user: { email: string }; services: string[] }>();
    expect(me.user.email).toBe('owner@example.com');
    expect(me.services).not.toContain('calendar');
  });

  it('labels devices coarsely', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/130 Safari/537')).toBe('Chrome on Windows');
    expect(deviceLabel(undefined)).toBe('Unknown device');
  });
});

describe('state tampering', () => {
  async function callbackWith(mutate: (state: string) => string, jarMutate?: (j: Jar) => void) {
    const jar = new Jar();
    const start = await req('/api/auth/start', { jar });
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!;
    jarMutate?.(jar);
    return req(`/api/auth/callback?code=x&state=${encodeURIComponent(mutate(state))}`, { jar });
  }
  it('rejects a modified state', async () => {
    const res = await callbackWith((s) => s.slice(0, 10) + (s[10] === 'A' ? 'B' : 'A') + s.slice(11));
    expect(res.headers.get('Location')).toBe('/?auth_error=bad_state');
  });
  it('rejects a state without the matching nonce cookie (login CSRF)', async () => {
    const res = await callbackWith((s) => s, (j) => j.cookies.delete('oauth_nonce'));
    expect(res.headers.get('Location')).toBe('/?auth_error=bad_state');
  });
  it('rejects an expired state', async () => {
    const ring = await loadKeyRing('mock:' + b64encode(new TextEncoder().encode('mock-google-dev-key-not-secret!!')));
    const sealed = await seal(ring, { v: 'x', r: '/app', n: 'n', exp: Date.now() - 1, mode: 'signin' });
    const jar = new Jar();
    jar.cookies.set('oauth_nonce', 'n');
    const res = await req(`/api/auth/callback?code=x&state=${sealed}`, { jar });
    expect(res.headers.get('Location')).toBe('/?auth_error=bad_state');
  });
});

describe('CSRF', () => {
  it('requires Origin and the custom header on state-changing routes', async () => {
    const { jar } = await signIn();
    expect((await req('/api/auth/logout', { method: 'POST', jar })).status).toBe(403);
    expect((await req('/api/auth/logout', { method: 'POST', jar, headers: { Origin: 'https://evil.example', 'X-Requested-With': 'notes-app' } })).status).toBe(403);
    expect((await req('/api/auth/logout', { method: 'POST', jar, headers: { Origin: 'http://localhost:8787' } })).status).toBe(403);
    expect((await req('/api/auth/logout', { method: 'POST', jar, csrf: true })).status).toBe(200);
  });
});

describe('sessions', () => {
  it('expires sessions', async () => {
    const { jar } = await signIn();
    await env.DB.prepare('UPDATE sessions SET expires_at = ?').bind(Date.now() - 1000).run();
    expect((await req('/api/me', { jar })).status).toBe(401);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first('n')).toBe(0);
  });

  it('slides expiry forward on use', async () => {
    const { jar } = await signIn();
    const old = Date.now() - 2 * 3600 * 1000;
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ?').bind(old, old + 1000 * 3600 * 24).run();
    await req('/api/me', { jar });
    const row = await env.DB.prepare('SELECT expires_at FROM sessions').first<{ expires_at: number }>();
    expect(row!.expires_at).toBeGreaterThan(Date.now() + 59 * 24 * 3600 * 1000);
  });

  it('lists devices and revokes another device', async () => {
    const a = await signIn();
    const b = await signIn();
    const list = await (await req('/api/sessions', { jar: a.jar })).json<{ id: string; current: boolean }[]>();
    expect(list).toHaveLength(2);
    const other = list.find((s) => !s.current)!;
    expect((await req(`/api/sessions/${other.id}`, { method: 'DELETE', jar: a.jar, csrf: true })).status).toBe(200);
    expect((await req('/api/me', { jar: b.jar })).status).toBe(401);
    expect((await req('/api/me', { jar: a.jar })).status).toBe(200);
  });

  it('logout deletes the session', async () => {
    const { jar } = await signIn();
    const sid = jar.cookies.get('sid')!;
    await req('/api/auth/logout', { method: 'POST', jar, csrf: true });
    const j2 = new Jar();
    j2.cookies.set('sid', sid);
    expect((await req('/api/me', { jar: j2 })).status).toBe(401);
  });
});

describe('encryption', () => {
  it('round-trips, binds to AAD, and supports key rotation', async () => {
    const k1 = 'v1:' + b64encode(randomBytes(32));
    const k2 = 'v2:' + b64encode(randomBytes(32));
    const ring1 = await loadKeyRing(k1);
    const { data, iv } = await encrypt(ring1, 'refresh-token', 'user-1');
    expect(data.startsWith('v1:')).toBe(true);
    expect(data).not.toContain('refresh-token');
    expect(await decrypt(ring1, data, iv, 'user-1')).toBe('refresh-token');
    await expect(decrypt(ring1, data, iv, 'user-2')).rejects.toThrow();
    const ring2 = await loadKeyRing(`${k2},${k1}`);
    expect(await decrypt(ring2, data, iv, 'user-1')).toBe('refresh-token');
    expect((await encrypt(ring2, 'x', 'u')).data.startsWith('v2:')).toBe(true);
    await expect(loadKeyRing('v1:' + b64encode(randomBytes(16)))).rejects.toThrow(/32 bytes/);
  });

  it('stores refresh tokens encrypted at rest', async () => {
    await signIn();
    const g = await env.DB.prepare('SELECT refresh_token_enc FROM grants').first<{ refresh_token_enc: string }>();
    expect(g!.refresh_token_enc).not.toMatch(/mock-rt-/);
  });

  it('seal/unseal detects tampering', async () => {
    const ring = await loadKeyRing('v1:' + b64encode(randomBytes(32)));
    const s = await seal(ring, { a: 1 });
    expect(await unseal(ring, s)).toEqual({ a: 1 });
    await expect(unseal(ring, s.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A')))).rejects.toThrow();
  });
});

describe('rate limiting', () => {
  it('limits auth routes per client', async () => {
    let last = 0;
    for (let i = 0; i <= RATE_LIMIT.max; i++) last = (await req('/api/auth/start', { headers: { 'CF-Connecting-IP': '1.2.3.4', 'X-Test-Rate-Limit': '1' } })).status;
    expect(last).toBe(429);
    expect((await req('/api/auth/start', { headers: { 'CF-Connecting-IP': '5.6.7.8', 'X-Test-Rate-Limit': '1' } })).status).toBe(302);
  });
});

describe('access tokens', () => {
  it('mints, caches, and enforces registered + granted scopes', async () => {
    const { jar } = await signIn({ untick: [CAL] });
    const t1 = await (await req(`/api/token?scopes=${encodeURIComponent(DRIVE)}`, { jar })).json<{ access_token: string }>();
    const t2 = await (await req(`/api/token?scopes=${encodeURIComponent(DRIVE)}`, { jar })).json<{ access_token: string }>();
    expect(t1.access_token).toBe(t2.access_token);
    expect((await req(`/api/token?scopes=${encodeURIComponent(CAL)}`, { jar })).status).toBe(403);
    expect((await req(`/api/token?scopes=${encodeURIComponent('https://www.googleapis.com/auth/gmail.readonly')}`, { jar })).status).toBe(400);
    const me = await (await req('/api/me', { jar })).json<{ services: string[] }>();
    expect(me.services).toEqual(['drive', 'tasks']);
  });

  it('refreshes near expiry', async () => {
    const { jar } = await signIn();
    const t1 = await (await req(`/api/token?scopes=${encodeURIComponent(DRIVE)}`, { jar })).json<{ access_token: string }>();
    for (const v of tokenCache.values()) v.exp = Date.now() + 60_000; // within the 5-minute early-refresh window
    const t2 = await (await req(`/api/token?scopes=${encodeURIComponent(DRIVE)}`, { jar })).json<{ access_token: string }>();
    expect(t2.access_token).not.toBe(t1.access_token);
  });

  it('marks the grant invalid when Google revokes the refresh token', async () => {
    const { jar } = await signIn();
    for (const r of mock.refreshTokens.values()) r.revoked = true;
    tokenCache.clear();
    const res = await req(`/api/token?scopes=${encodeURIComponent(DRIVE)}`, { jar });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'reconnect_required' });
    const me = await (await req('/api/me', { jar })).json<{ needsReconnect: boolean }>();
    expect(me.needsReconnect).toBe(true);
    // Reconnecting (forced consent) clears the invalid flag.
    await signIn({ jar });
    expect((await (await req('/api/me', { jar })).json<{ needsReconnect: boolean }>()).needsReconnect).toBe(false);
  });

  it('incremental connect returns a Google URL with include_granted_scopes', async () => {
    const { jar } = await signIn({ untick: [CAL] });
    const res = await req('/api/services/connect', { method: 'POST', jar, csrf: true, body: JSON.stringify({ service: 'calendar' }), headers: { 'Content-Type': 'application/json' } });
    const { url } = await res.json<{ url: string }>();
    const u = new URL(url);
    expect(u.searchParams.get('scope')).toContain(CAL);
    expect(u.searchParams.get('include_granted_scopes')).toBe('true');
  });
});

describe('account deletion', () => {
  it('revokes at Google and deletes every row', async () => {
    const { jar } = await signIn();
    const res = await req('/api/account', { method: 'DELETE', jar, csrf: true });
    expect(res.status).toBe(200);
    for (const t of ['users', 'grants', 'sessions']) expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first('n')).toBe(0);
    expect([...mock.refreshTokens.values()].every((r) => r.revoked)).toBe(true);
  });
});
