const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const b64url = (bytes: Uint8Array) => b64encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b64urlDecode = (s: string) => b64decode(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}
/** 256-bit random id, base64url. */
export const randomId = () => b64url(randomBytes(32));

export async function sha256(input: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(input))));
}

/** PKCE S256 code challenge for a verifier. */
export const pkceChallenge = (verifier: string) => sha256(verifier);

export interface KeyRing { current: { version: string; key: CryptoKey }; byVersion: Map<string, CryptoKey> }

/** Parse "v2:<b64>,v1:<b64>" (current first). Each key must be 32 bytes. */
export async function loadKeyRing(spec: string): Promise<KeyRing> {
  const parts = spec.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) throw new Error('TOKEN_ENC_KEY is empty');
  const byVersion = new Map<string, CryptoKey>();
  let current: KeyRing['current'] | undefined;
  for (const p of parts) {
    const i = p.indexOf(':');
    if (i < 1) throw new Error('TOKEN_ENC_KEY entries must look like v1:<base64>');
    const version = p.slice(0, i);
    const raw = b64decode(p.slice(i + 1));
    if (raw.length !== 32) throw new Error(`TOKEN_ENC_KEY ${version} must be 32 bytes`);
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    byVersion.set(version, key);
    current ??= { version, key };
  }
  return { current: current!, byVersion };
}

/** AES-GCM encrypt; result is "<version>:<b64 ciphertext>" plus b64 iv. `aad` binds the ciphertext to e.g. a user id. */
export async function encrypt(ring: KeyRing, plaintext: string, aad: string): Promise<{ data: string; iv: string }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, ring.current.key, enc.encode(plaintext));
  return { data: `${ring.current.version}:${b64encode(new Uint8Array(ct))}`, iv: b64encode(iv) };
}

export async function decrypt(ring: KeyRing, data: string, iv: string, aad: string): Promise<string> {
  const i = data.indexOf(':');
  const key = ring.byVersion.get(data.slice(0, i));
  if (!key) throw new Error('Unknown key version');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(iv), additionalData: enc.encode(aad) }, key, b64decode(data.slice(i + 1)));
  return dec.decode(pt);
}

/** Seal a JSON payload (authenticated encryption) into a URL-safe string. Used for OAuth `state`. */
export async function seal(ring: KeyRing, payload: unknown): Promise<string> {
  const { data, iv } = await encrypt(ring, JSON.stringify(payload), 'oauth-state');
  return `${b64url(enc.encode(data))}.${b64url(b64decode(iv))}`;
}
export async function unseal<T>(ring: KeyRing, sealed: string): Promise<T> {
  const [d, iv] = sealed.split('.');
  if (!d || !iv) throw new Error('Malformed state');
  return JSON.parse(await decrypt(ring, dec.decode(b64urlDecode(d)), b64encode(b64urlDecode(iv)), 'oauth-state')) as T;
}

/** Fixed dev-only key used when MOCK_GOOGLE=1 and no TOKEN_ENC_KEY is configured. Never used with real Google. */
export const MOCK_DEV_KEY = 'mock:' + b64encode(enc.encode('mock-google-dev-key-not-secret!!'));

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
