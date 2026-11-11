import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { allowedScopes, buildCsp, filterAllowedScopes, grantedServiceIds, serviceManifests, signInScopes } from '../src/services/registry.ts';
import { decrypt, encrypt, loadKeyRing, MOCK_DEV_KEY, pkceChallenge, randomId, seal, sha256, unseal, type KeyRing } from './crypto.ts';
import type { Env } from './env.ts';
import { isMock } from './env.ts';
import { clientId, decodeIdToken, GrantRevokedError, oauthClient } from './google.ts';
import { mockRoutes } from './mock/routes.ts';

export const SESSION_COOKIE = 'sid';
export const NONCE_COOKIE = 'oauth_nonce';
export const SESSION_TTL_MS = 60 * 24 * 3600 * 1000;
/** Only touch last_seen/expiry at most this often (sliding expiry). */
const SESSION_TOUCH_MS = 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
/** Access tokens are served from cache until this long before they expire. */
const TOKEN_EARLY_REFRESH_MS = 5 * 60 * 1000;
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_VALUE = 'notes-app';

export interface User { id: string; google_sub: string; email: string; name: string | null; picture_url: string | null }
export interface Grant { user_id: string; scopes: string; refresh_token_enc: string; iv: string; invalid_at: number | null }
export interface StatePayload { v: string; r: string; n: string; exp: number; mode: 'signin' | 'connect' }

export type Vars = { user: User; sessionHash: string; ring: KeyRing };
type C = Context<{ Bindings: Env; Variables: Vars }>;

// ---------------------------------------------------------------- per-isolate caches
const ringCache = new Map<string, Promise<KeyRing>>();
function keyRing(env: Env): Promise<KeyRing> {
  const spec = env.TOKEN_ENC_KEY || (isMock(env) ? MOCK_DEV_KEY : '');
  if (!spec) throw new Error('TOKEN_ENC_KEY secret is not configured');
  let p = ringCache.get(spec);
  if (!p) ringCache.set(spec, (p = loadKeyRing(spec)));
  return p;
}

/** Access tokens cached in memory only (never persisted, never logged). Key: user id + sorted scopes. */
export const tokenCache = new Map<string, { token: string; exp: number; scopes: string[] }>();

/** Fixed-window rate limiter per client IP and route bucket. */
const rateBuckets = new Map<string, { start: number; count: number }>();
export const RATE_LIMIT = { windowMs: 60_000, max: 30, mockMax: 10_000 };
export function resetRateLimits() { rateBuckets.clear(); }

const rateLimit = (bucket: string): MiddlewareHandler => async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'local';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || now - b.start > RATE_LIMIT.windowMs) rateBuckets.set(key, { start: now, count: 1 });
  // Mock mode (dev/e2e) gets a high ceiling unless a test opts into the real limit.
  else if (++b.count > (isMock(c.env as Env) && !c.req.header('X-Test-Rate-Limit') ? RATE_LIMIT.mockMax : RATE_LIMIT.max)) return c.json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  await next();
};

// ---------------------------------------------------------------- helpers
const now = () => Date.now();
const isSecure = (c: C) => new URL(c.req.url).protocol === 'https:' || new URL(c.req.url).hostname === 'localhost';
const cookieOpts = (c: C, maxAgeSec: number) => ({ httpOnly: true, secure: isSecure(c), sameSite: 'Lax' as const, path: '/', maxAge: maxAgeSec });
const origin = (c: C) => new URL(c.req.url).origin;
const redirectUri = (c: C) => `${origin(c)}/api/auth/callback`;
/** Only same-origin relative paths are allowed as post-login destinations. */
export function safeReturn(r: string | undefined): string {
  // Reject protocol-relative tricks, backslashes and whitespace/control characters (browsers strip tabs/newlines).
  // eslint-disable-next-line no-control-regex -- control characters are exactly what we reject
  if (!r || r.includes('\\') || !/^\/(?!\/)[^\s\u0000-\u001f\u007f]*$/.test(r)) return '/app';
  const u = new URL(r, 'https://app.invalid');
  return u.origin === 'https://app.invalid' ? u.pathname + u.search + u.hash : '/app';
}

export function deviceLabel(ua: string | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return `${browser} on ${os}`;
}

async function startAuth(c: C, scopes: string[], mode: StatePayload['mode'], returnTo: string, forceConsent: boolean, loginHint?: string): Promise<string> {
  const ring = await keyRing(c.env);
  const verifier = randomId();
  const nonce = randomId();
  const state = await seal(ring, { v: verifier, r: safeReturn(returnTo), n: nonce, exp: now() + STATE_TTL_MS, mode } satisfies StatePayload);
  setCookie(c, NONCE_COOKIE, nonce, { ...cookieOpts(c, STATE_TTL_MS / 1000), path: '/api/auth' });
  return oauthClient(c.env, origin(c)).authorizeUrl({
    client_id: clientId(c.env),
    redirect_uri: redirectUri(c),
    response_type: 'code',
    scope: filterAllowedScopes(scopes).join(' '),
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: forceConsent ? 'consent select_account' : 'select_account',
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
}

async function createSession(c: C, userId: string) {
  const id = randomId();
  const t = now();
  await c.env.DB.prepare('INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at, device_label) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256(id), userId, t, t, t + SESSION_TTL_MS, deviceLabel(c.req.header('User-Agent'))).run();
  setCookie(c, SESSION_COOKIE, id, cookieOpts(c, SESSION_TTL_MS / 1000));
}

async function getGrant(env: Env, userId: string) {
  return env.DB.prepare('SELECT * FROM grants WHERE user_id = ?').bind(userId).first<Grant>();
}

async function deleteUser(env: Env, userId: string) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM grants WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);
  for (const k of tokenCache.keys()) if (k.startsWith(userId + '|')) tokenCache.delete(k);
}

// ---------------------------------------------------------------- middleware
/** CSRF: SameSite=Lax cookie + Origin must match + custom header required on state-changing requests. */
const csrf: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const o = c.req.header('Origin');
    if (!o || o !== origin(c) || c.req.header(CSRF_HEADER) !== CSRF_VALUE) return c.json({ error: 'csrf' }, 403);
  }
  await next();
};

const requireSession: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (!sid) return c.json({ error: 'unauthenticated' }, 401);
  const hash = await sha256(sid);
  const row = await c.env.DB.prepare(
    'SELECT u.id, u.google_sub, u.email, u.name, u.picture_url, s.expires_at, s.last_seen_at AS session_seen FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?',
  ).bind(hash).first<User & { expires_at: number; session_seen: number }>();
  if (!row || row.expires_at <= now()) {
    if (row) await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(hash).run();
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ error: 'unauthenticated' }, 401);
  }
  if (now() - row.session_seen > SESSION_TOUCH_MS) {
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?').bind(now(), now() + SESSION_TTL_MS, hash),
      c.env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now(), row.id),
    ]);
    setCookie(c, SESSION_COOKIE, sid, cookieOpts(c, SESSION_TTL_MS / 1000));
  }
  c.set('user', { id: row.id, google_sub: row.google_sub, email: row.email, name: row.name, picture_url: row.picture_url });
  c.set('sessionHash', hash);
  await next();
};

// ---------------------------------------------------------------- app
export function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();
  const api = new Hono<{ Bindings: Env; Variables: Vars }>();

  api.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });
  api.use('*', csrf);

  api.get('/config', (c) => {
    const base = isMock(c.env) ? `${origin(c)}/__mock/googleapis` : null;
    return c.json({
      mock: isMock(c.env),
      apiBase: Object.fromEntries(serviceManifests.flatMap((s) => s.apiOrigins).map((o) => [o, base ?? o])),
    });
  });

  // --- auth
  api.get('/auth/start', rateLimit('auth'), async (c) => {
    const service = c.req.query('service');
    const scopes = service ? serviceManifests.find((s) => s.id === service)?.scopes ?? [] : signInScopes();
    const url = await startAuth(c, ['openid', 'email', 'profile', ...scopes], service ? 'connect' : 'signin', c.req.query('return') ?? '/app', c.req.query('consent') === '1');
    return c.redirect(url);
  });

  api.get('/auth/callback', rateLimit('auth'), async (c) => {
    const fail = (reason: string) => c.redirect(`/?auth_error=${encodeURIComponent(reason)}`);
    const { code, state, error } = c.req.query();
    const nonce = getCookie(c, NONCE_COOKIE);
    deleteCookie(c, NONCE_COOKIE, { path: '/api/auth' });
    if (!state) return fail('missing_state');
    let st: StatePayload;
    try {
      st = await unseal<StatePayload>(await keyRing(c.env), state);
    } catch {
      return fail('bad_state');
    }
    if (st.exp < now() || !nonce || st.n !== nonce) return fail('bad_state');
    if (error) return c.redirect(error === 'access_denied' && st.mode === 'connect' ? st.r : `/?auth_error=${encodeURIComponent(error)}`);
    if (!code) return fail('missing_code');

    const client = oauthClient(c.env, origin(c));
    let tokens;
    try {
      tokens = await client.exchangeCode(code, st.v, redirectUri(c));
    } catch {
      return fail('exchange_failed');
    }
    const claims = decodeIdToken(tokens.id_token ?? '');
    if (!claims.sub || !claims.email) return fail('missing_identity');
    // Connect/reconnect from a signed-in session must use the same Google account.
    const sid = getCookie(c, SESSION_COOKIE);
    if (st.mode === 'connect' && sid) {
      const owner = await c.env.DB.prepare('SELECT u.google_sub FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?')
        .bind(await sha256(sid)).first<{ google_sub: string }>();
      if (owner && owner.google_sub !== claims.sub) return c.redirect(`${st.r}${st.r.includes('?') ? '&' : '?'}auth_error=account_mismatch`);
    }
    const t = now();
    const existing = await c.env.DB.prepare('SELECT * FROM users WHERE google_sub = ?').bind(claims.sub).first<User>();
    const userId = existing?.id ?? randomId();
    if (existing) {
      await c.env.DB.prepare('UPDATE users SET email = ?, name = ?, picture_url = ?, last_seen_at = ? WHERE id = ?')
        .bind(claims.email, claims.name ?? null, claims.picture ?? null, t, userId).run();
    } else {
      await c.env.DB.prepare('INSERT INTO users (id, google_sub, email, name, picture_url, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(userId, claims.sub, claims.email, claims.name ?? null, claims.picture ?? null, t, t).run();
    }
    // Google reports identity scopes as userinfo.* URLs; normalise to the short names in the registry.
    const IDENTITY_ALIASES: Record<string, string> = {
      'https://www.googleapis.com/auth/userinfo.email': 'email',
      'https://www.googleapis.com/auth/userinfo.profile': 'profile',
    };
    const granted = filterAllowedScopes(tokens.scope.split(' ').map((s) => IDENTITY_ALIASES[s] ?? s));
    const grant = await getGrant(c.env, userId);
    const ring = await keyRing(c.env);
    if (tokens.refresh_token) {
      const { data, iv } = await encrypt(ring, tokens.refresh_token, userId);
      await c.env.DB.prepare(
        'INSERT INTO grants (user_id, scopes, refresh_token_enc, iv, updated_at, invalid_at) VALUES (?, ?, ?, ?, ?, NULL) ' +
          'ON CONFLICT(user_id) DO UPDATE SET scopes = excluded.scopes, refresh_token_enc = excluded.refresh_token_enc, iv = excluded.iv, updated_at = excluded.updated_at, invalid_at = NULL',
      ).bind(userId, granted.join(' '), data, iv, t).run();
    } else if (grant && !grant.invalid_at) {
      await c.env.DB.prepare('UPDATE grants SET scopes = ?, updated_at = ? WHERE user_id = ?').bind(granted.join(' '), t, userId).run();
    } else {
      // No usable refresh token on file and Google didn't send one: ask again with forced consent.
      return c.redirect(await startAuth(c, ['openid', 'email', 'profile', ...granted], st.mode, st.r, true, claims.email));
    }
    for (const k of tokenCache.keys()) if (k.startsWith(userId + '|')) tokenCache.delete(k);
    tokenCache.set(`${userId}|${[...granted].sort().join(' ')}`, { token: tokens.access_token, exp: t + tokens.expires_in * 1000, scopes: granted });
    if (st.mode === 'signin' || !getCookie(c, SESSION_COOKIE)) await createSession(c, userId);
    return c.redirect(st.r);
  });

  api.post('/auth/logout', async (c) => {
    const sid = getCookie(c, SESSION_COOKIE);
    if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256(sid)).run();
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // --- signed-in routes
  api.use('/me', requireSession);
  api.use('/sessions/*', requireSession);
  api.use('/sessions', requireSession);
  api.use('/token', requireSession);
  api.use('/services/*', requireSession);
  api.use('/account', requireSession);

  api.get('/me', async (c) => {
    const u = c.get('user');
    const grant = await getGrant(c.env, u.id);
    const scopes = grant?.scopes.split(' ').filter(Boolean) ?? [];
    return c.json({
      user: { id: u.id, email: u.email, name: u.name, picture: u.picture_url },
      grantedScopes: scopes,
      services: grantedServiceIds(scopes),
      needsReconnect: !grant || !!grant.invalid_at,
      mock: isMock(c.env),
    });
  });

  api.get('/sessions', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT id_hash, created_at, last_seen_at, expires_at, device_label FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC')
      .bind(c.get('user').id).all<{ id_hash: string; created_at: number; last_seen_at: number; expires_at: number; device_label: string }>();
    return c.json(results.map((s) => ({ id: s.id_hash, label: s.device_label, createdAt: s.created_at, lastSeenAt: s.last_seen_at, current: s.id_hash === c.get('sessionHash') })));
  });

  api.delete('/sessions/:id', async (c) => {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ? AND user_id = ?').bind(id, c.get('user').id).run();
    if (id === c.get('sessionHash')) deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  api.get('/token', async (c) => {
    const u = c.get('user');
    const grant = await getGrant(c.env, u.id);
    if (!grant || grant.invalid_at) return c.json({ error: 'reconnect_required' }, 409);
    const granted = grant.scopes.split(' ');
    const requested = (c.req.query('scopes') ?? '').split(/[ ,]+/).filter(Boolean);
    if (!requested.length) return c.json({ error: 'scopes_required' }, 400);
    const notAllowed = requested.filter((s) => !allowedScopes().includes(s));
    if (notAllowed.length) return c.json({ error: 'scope_not_registered', scopes: notAllowed }, 400);
    const missing = requested.filter((s) => !granted.includes(s));
    if (missing.length) return c.json({ error: 'scope_not_granted', scopes: missing }, 403);

    const key = `${u.id}|${[...requested].sort().join(' ')}`;
    // force=1: the browser got a 401 from Google with the cached token, so mint a fresh one.
    if (c.req.query('force') === '1') for (const k of tokenCache.keys()) if (k.startsWith(u.id + '|')) tokenCache.delete(k);
    const cached = tokenCache.get(key);
    if (cached && cached.exp - TOKEN_EARLY_REFRESH_MS > now()) return c.json({ access_token: cached.token, expires_at: cached.exp, scopes: cached.scopes });
    // A cached token for a superset of scopes is fine too.
    for (const [k, v] of tokenCache) {
      if (k.startsWith(u.id + '|') && v.exp - TOKEN_EARLY_REFRESH_MS > now() && requested.every((s) => v.scopes.includes(s))) {
        return c.json({ access_token: v.token, expires_at: v.exp, scopes: v.scopes });
      }
    }
    const ring = await keyRing(c.env);
    const refreshToken = await decrypt(ring, grant.refresh_token_enc, grant.iv, u.id);
    try {
      const t = await oauthClient(c.env, origin(c)).refresh(refreshToken, requested);
      const scopes = t.scope.split(' ').filter(Boolean);
      const entry = { token: t.access_token, exp: now() + t.expires_in * 1000, scopes };
      tokenCache.set(key, entry);
      // Re-encrypt with the current key version if the stored one is older (key rotation).
      if (!grant.refresh_token_enc.startsWith(ring.current.version + ':')) {
        const { data, iv } = await encrypt(ring, refreshToken, u.id);
        await c.env.DB.prepare('UPDATE grants SET refresh_token_enc = ?, iv = ? WHERE user_id = ?').bind(data, iv, u.id).run();
      }
      return c.json({ access_token: entry.token, expires_at: entry.exp, scopes });
    } catch (e) {
      if (e instanceof GrantRevokedError) {
        await c.env.DB.prepare('UPDATE grants SET invalid_at = ? WHERE user_id = ?').bind(now(), u.id).run();
        for (const k of tokenCache.keys()) if (k.startsWith(u.id + '|')) tokenCache.delete(k);
        return c.json({ error: 'reconnect_required' }, 409);
      }
      return c.json({ error: 'google_unavailable' }, 502);
    }
  });

  api.post('/services/connect', rateLimit('auth'), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { service?: string; return?: string; reconnect?: boolean };
    const svc = serviceManifests.find((s) => s.id === body.service);
    const grant = await getGrant(c.env, c.get('user').id);
    const scopes = body.reconnect ? signInScopes() : svc?.scopes;
    if (!scopes) return c.json({ error: 'unknown_service' }, 400);
    const url = await startAuth(c, ['openid', 'email', 'profile', ...scopes], 'connect', body.return ?? '/app', !!body.reconnect || !grant || !!grant.invalid_at, c.get('user').email);
    return c.json({ url });
  });

  api.post('/services/disconnect', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { service?: string };
    const svc = serviceManifests.find((s) => s.id === body.service);
    if (!svc || svc.required) return c.json({ error: 'cannot_disconnect' }, 400);
    const u = c.get('user');
    const grant = await getGrant(c.env, u.id);
    if (grant) {
      const scopes = grant.scopes.split(' ').filter((s) => !svc.scopes.includes(s));
      await c.env.DB.prepare('UPDATE grants SET scopes = ?, updated_at = ? WHERE user_id = ?').bind(scopes.join(' '), now(), u.id).run();
    }
    for (const k of tokenCache.keys()) if (k.startsWith(u.id + '|')) tokenCache.delete(k);
    return c.json({ ok: true });
  });

  api.delete('/account', async (c) => {
    const u = c.get('user');
    const grant = await getGrant(c.env, u.id);
    if (grant) {
      try {
        const rt = await decrypt(await keyRing(c.env), grant.refresh_token_enc, grant.iv, u.id);
        await oauthClient(c.env, origin(c)).revoke(rt);
      } catch {
        // Revocation is best-effort; account rows are deleted regardless.
      }
    }
    await deleteUser(c.env, u.id);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  api.all('*', (c) => c.json({ error: 'not_found' }, 404));

  app.route('/api', api);
  app.use('/__mock/*', async (c, next) => (isMock(c.env) ? next() : c.text('Not found', 404)));
  app.route('/__mock', mockRoutes);

  // Static app with security headers.
  app.all('*', async (c) => {
    if (!c.env.ASSETS) return c.text('Not found', 404);
    const res = await c.env.ASSETS.fetch(c.req.raw);
    const out = new Response(res.body, res);
    const type = out.headers.get('Content-Type') ?? '';
    if (type.includes('text/html')) {
      let csp = buildCsp();
      if (new URL(c.req.url).protocol === 'https:') csp += '; upgrade-insecure-requests';
      out.headers.set('Content-Security-Policy', csp);
      out.headers.set('Cache-Control', 'no-cache');
    }
    out.headers.set('X-Content-Type-Options', 'nosniff');
    out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    out.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    out.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    return out;
  });

  return app;
}
