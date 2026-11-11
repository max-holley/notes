import { api, HttpError, type AppConfig } from '../lib/api.ts';
import { ReconnectRequiredError, TransientError } from '../sync/engine.ts';

/**
 * Shared token provider + authenticated fetch for every Google service module.
 * Access tokens live in memory only (never localStorage, never logged).
 */
export class ScopeNotGrantedError extends Error {
  constructor(public scopes: string[]) {
    super('Scope not granted');
  }
}

type TokenEntry = { token: string; exp: number };
const tokens = new Map<string, TokenEntry>();
const pending = new Map<string, Promise<TokenEntry>>();
let config: AppConfig | null = null;
let onReconnect: (() => void) | null = null;

export function configureGoogle(c: AppConfig, reconnectHandler: () => void) {
  config = c;
  onReconnect = reconnectHandler;
}
export function clearTokens() {
  tokens.clear();
  pending.clear();
}

/** Rewrite a real Google API URL to the configured base (mock mode → same-origin fake). */
export function apiUrl(url: string): string {
  if (!config) return url;
  for (const [origin, base] of Object.entries(config.apiBase)) if (url.startsWith(origin)) return base + url.slice(origin.length);
  return url;
}

export async function getToken(scopes: string[], force = false): Promise<string> {
  const key = [...scopes].sort().join(' ');
  const cached = tokens.get(key);
  if (!force && cached && cached.exp - 60_000 > Date.now()) return cached.token;
  let p = pending.get(key);
  if (!p) {
    p = api
      .token(scopes, force)
      .then((r) => {
        const e = { token: r.access_token, exp: r.expires_at };
        tokens.set(key, e);
        return e;
      })
      .catch((e: unknown) => {
        if (e instanceof HttpError && e.status === 409) {
          onReconnect?.();
          throw new ReconnectRequiredError();
        }
        if (e instanceof HttpError && e.status === 403) throw new ScopeNotGrantedError(scopes);
        if (e instanceof HttpError && e.status === 401) {
          onReconnect?.();
          throw new ReconnectRequiredError();
        }
        throw new TransientError(String(e));
      })
      .finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return (await p).token;
}

export interface AuthFetchOptions extends RequestInit {
  scopes: string[];
  retries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with Bearer token, retry/backoff on 429/5xx/network, one forced token refresh on 401. */
export async function authFetch(url: string, opts: AuthFetchOptions): Promise<Response> {
  const { scopes, retries = 2, ...init } = opts;
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    const token = await getToken(scopes, refreshed && attempt > 0);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    let res: Response;
    try {
      res = await fetch(apiUrl(url), { ...init, headers });
    } catch (e) {
      if (attempt < retries) {
        await sleep(300 * 2 ** attempt);
        continue;
      }
      throw new TransientError(String(e));
    }
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      tokens.clear();
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(300 * 2 ** attempt);
      continue;
    }
    if (res.status === 429 || res.status >= 500) throw new TransientError(`HTTP ${res.status}`);
    if (res.status === 403) {
      const body = await res.clone().json().catch(() => ({}));
      if (JSON.stringify(body).includes('insufficient')) throw new ScopeNotGrantedError(scopes);
    }
    return res;
  }
}

export async function authJson<T>(url: string, opts: AuthFetchOptions): Promise<T> {
  const res = await authFetch(url, opts);
  if (!res.ok) throw new HttpError(res.status, await res.text());
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
