export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  /** "1" enables the in-repo fake Google (dev + tests). */
  MOCK_GOOGLE?: string;
  GOOGLE_CLIENT_ID?: string;
  /** Secret (wrangler secret put). */
  GOOGLE_CLIENT_SECRET?: string;
  /** Secret: comma-separated versioned AES-256 keys, current first: "v2:<base64>,v1:<base64>". */
  TOKEN_ENC_KEY?: string;
}

export const isMock = (env: Env) => env.MOCK_GOOGLE === '1' || env.MOCK_GOOGLE === 'true';
