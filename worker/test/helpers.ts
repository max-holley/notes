import { env } from 'cloudflare:test';
import { createApp, CSRF_HEADER, CSRF_VALUE } from '../app.ts';

export const ORIGIN = 'http://localhost:8787';
export const app = createApp();

export class Jar {
  cookies = new Map<string, string>();
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  absorb(res: Response) {
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';');
      const i = pair!.indexOf('=');
      const k = pair!.slice(0, i);
      const v = pair!.slice(i + 1);
      if (!v || /max-age=0/i.test(sc)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
  }
}

export async function req(path: string, init: RequestInit & { jar?: Jar; csrf?: boolean } = {}) {
  const headers = new Headers(init.headers);
  if (init.jar) headers.set('Cookie', init.jar.header());
  if (init.csrf) {
    headers.set('Origin', ORIGIN);
    headers.set(CSRF_HEADER, CSRF_VALUE);
  }
  const res = await app.fetch(new Request(ORIGIN + path, { ...init, headers, redirect: 'manual' }), env);
  init.jar?.absorb(res);
  return res;
}

/** Run the full mock OAuth flow. `untick` lists scopes to deny on the consent screen. */
export async function signIn(opts: { email?: string; untick?: string[]; jar?: Jar; returnTo?: string } = {}) {
  const jar = opts.jar ?? new Jar();
  const start = await req(`/api/auth/start${opts.returnTo ? `?return=${encodeURIComponent(opts.returnTo)}` : ''}`, { jar });
  const authUrl = new URL(start.headers.get('Location')!);
  const p = authUrl.searchParams;
  const form = new URLSearchParams();
  for (const k of ['client_id', 'redirect_uri', 'state', 'code_challenge', 'access_type', 'include_granted_scopes', 'prompt']) form.set(k, p.get(k) ?? '');
  form.set('email', opts.email ?? 'alex@example.com');
  form.set('name', 'Alex');
  form.set('decision', 'allow');
  for (const s of (p.get('scope') ?? '').split(' ')) if (!opts.untick?.includes(s)) form.append('scope', s);
  const approve = await req('/__mock/oauth/approve', { method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  const cb = new URL(approve.headers.get('Location')!);
  const done = await req(cb.pathname + cb.search, { jar });
  return { jar, start, authUrl, callback: cb, done };
}
