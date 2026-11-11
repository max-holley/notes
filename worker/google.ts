import type { Env } from './env.ts';
import { isMock } from './env.ts';
import { b64urlDecode } from './crypto.ts';
import { mockOAuth } from './mock/oauth.ts';

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}
export interface IdentityClaims { sub: string; email: string; name?: string; picture?: string }

/** Thrown when Google says the refresh token is revoked/expired (`invalid_grant`). */
export class GrantRevokedError extends Error {
  constructor() { super('invalid_grant'); }
}

export interface OAuthClient {
  authorizeUrl(params: Record<string, string>): string;
  exchangeCode(code: string, verifier: string, redirectUri: string): Promise<TokenResponse>;
  refresh(refreshToken: string, scopes: string[]): Promise<TokenResponse>;
  revoke(token: string): Promise<void>;
}

export function decodeIdToken(idToken: string): IdentityClaims {
  const payload = idToken.split('.')[1];
  if (!payload) throw new Error('Malformed id_token');
  return JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as IdentityClaims;
}

class RealGoogleOAuth implements OAuthClient {
  constructor(private env: Env) {}
  authorizeUrl(params: Record<string, string>) {
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams(params).toString();
  }
  private async token(body: Record<string, string>): Promise<TokenResponse> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.env.GOOGLE_CLIENT_ID ?? '', client_secret: this.env.GOOGLE_CLIENT_SECRET ?? '', ...body }),
    });
    const json = (await res.json()) as TokenResponse & { error?: string };
    if (!res.ok) {
      if (json.error === 'invalid_grant') throw new GrantRevokedError();
      throw new Error(`Google token endpoint: ${json.error ?? res.status}`);
    }
    return json;
  }
  exchangeCode(code: string, verifier: string, redirectUri: string) {
    return this.token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri });
  }
  refresh(refreshToken: string, scopes: string[]) {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: scopes.join(' ') });
  }
  async revoke(token: string) {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
  }
}

export function oauthClient(env: Env, origin: string): OAuthClient {
  return isMock(env) ? mockOAuth(origin) : new RealGoogleOAuth(env);
}

export const clientId = (env: Env) => (isMock(env) ? 'mock-client-id' : env.GOOGLE_CLIENT_ID ?? '');
