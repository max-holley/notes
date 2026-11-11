import { b64url, pkceChallenge } from '../crypto.ts';
import type { OAuthClient, TokenResponse } from '../google.ts';
import { GrantRevokedError } from '../google.ts';
import { mock, mockId } from './state.ts';

const enc = new TextEncoder();
const ACCESS_TTL = 3600;

function issueAccess(sub: string, scopes: string[]): TokenResponse {
  const access_token = mockId('mock-at-');
  mock.accessTokens.set(access_token, { sub, scopes, exp: Date.now() + ACCESS_TTL * 1000 });
  return { access_token, expires_in: ACCESS_TTL, scope: scopes.join(' ') };
}

/** In-process fake of Google's OAuth endpoints (no self-fetch from the Worker). */
export function mockOAuth(origin: string): OAuthClient {
  return {
    authorizeUrl: (params) => `${origin}/__mock/oauth/authorize?` + new URLSearchParams(params).toString(),
    async exchangeCode(code, verifier, redirectUri) {
      const c = mock.codes.get(code);
      mock.codes.delete(code);
      if (!c || c.redirectUri !== redirectUri) throw new GrantRevokedError();
      if ((await pkceChallenge(verifier)) !== c.challenge) throw new Error('PKCE verification failed');
      const user = mock.users.get(c.sub)!;
      const tokens = issueAccess(c.sub, c.scopes);
      if (c.issueRefresh) {
        const rt = mockId('mock-rt-');
        mock.refreshTokens.set(rt, { sub: c.sub, scopes: c.scopes, revoked: false });
        tokens.refresh_token = rt;
      }
      const claims = { sub: user.sub, email: user.email, name: user.name, picture: undefined };
      tokens.id_token = `e30.${b64url(enc.encode(JSON.stringify(claims)))}.mock`;
      return tokens;
    },
    async refresh(refreshToken, scopes) {
      const rt = mock.refreshTokens.get(refreshToken);
      if (!rt || rt.revoked) throw new GrantRevokedError();
      const user = mock.users.get(rt.sub);
      const granted = scopes.filter((s) => user?.consented.has(s));
      return issueAccess(rt.sub, granted);
    },
    async revoke(token) {
      const rt = mock.refreshTokens.get(token);
      if (rt) {
        rt.revoked = true;
        mock.users.get(rt.sub)?.consented.clear();
      }
    },
  };
}
