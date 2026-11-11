/** Same-origin backend calls. State-changing calls carry the CSRF header the Worker requires. */
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_VALUE = 'notes-app';

export interface Me {
  user: { id: string; email: string; name: string | null; picture: string | null };
  grantedScopes: string[];
  services: string[];
  needsReconnect: boolean;
  mock: boolean;
}
export interface AppConfig {
  mock: boolean;
  /** Map of real API origin → base URL to use (mock mode points at /__mock/googleapis). */
  apiBase: Record<string, string>;
}
export interface DeviceSession {
  id: string;
  label: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

export class HttpError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`HTTP ${status}`);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET') {
    headers.set(CSRF_HEADER, CSRF_VALUE);
    if (init.body) headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = res.headers.get('Content-Type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new HttpError(res.status, body);
  return body as T;
}

export const api = {
  config: () => call<AppConfig>('/api/config'),
  me: () => call<Me>('/api/me'),
  logout: () => call<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  sessions: () => call<DeviceSession[]>('/api/sessions'),
  revokeSession: (id: string) => call<{ ok: true }>(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  token: (scopes: string[], force = false) =>
    call<{ access_token: string; expires_at: number; scopes: string[] }>(`/api/token?scopes=${encodeURIComponent(scopes.join(' '))}${force ? '&force=1' : ''}`),
  connect: (body: { service?: string; reconnect?: boolean; return?: string }) =>
    call<{ url: string }>('/api/services/connect', { method: 'POST', body: JSON.stringify(body) }),
  disconnect: (service: string) => call<{ ok: true }>('/api/services/disconnect', { method: 'POST', body: JSON.stringify({ service }) }),
  deleteAccount: () => call<{ ok: true }>('/api/account', { method: 'DELETE' }),
};

/** Full-page navigation to start Google sign-in, preserving the deep link. */
export function signInUrl(returnTo: string) {
  return `/api/auth/start?return=${encodeURIComponent(returnTo)}`;
}
