# Notes app (rebuild)

A notes app that stores everything in the user's own Google Drive, with Google Tasks and Google
Calendar built in. It is a React 19 + MUI v7 (Material Design 3) single-page app, served by one
Cloudflare Worker that also handles accounts.

The product is **unbranded** by default. The name shown everywhere comes from
`src/brand/brand.config.ts`, and logos/icons are optional files in `public/brand/` (see
[docs/BRANDING.md](docs/BRANDING.md)).

## What runs where

| Piece | Where | Stores |
|---|---|---|
| Frontend (Vite + React + MUI + Tiptap) | Static assets on the Worker | IndexedDB: an outbox of unsynced edits plus the session working copy, wiped on sign-out. localStorage: theme, font, accent and a "signed in before" hint. |
| API (`worker/`, Hono) | Cloudflare Worker, same origin | D1: users, encrypted Google refresh tokens + granted scopes, device sessions. **No note data.** |
| Notes, images, Docs | The user's Google Drive (`Notes/` folder, `drive.file` scope) | `notes-file.json`, `images/*`, exported Google Docs |
| Tasks / events | Google Tasks / Google Calendar (called directly from the browser) | Task lines ↔ tasks link map lives in the Drive file |

Sign-in is OAuth 2.0 authorization code + PKCE, run by the Worker. The browser asks the Worker
for short-lived access tokens (`/api/token`) and calls Google APIs itself. Google services are
pluggable modules: see [docs/ADDING_A_GOOGLE_SERVICE.md](docs/ADDING_A_GOOGLE_SERVICE.md).

## Develop (no Google account needed)

Requirements: Node 22+ and pnpm 10.

```bash
pnpm install
pnpm exec playwright install chromium
pnpm serve:mock
```

`pnpm serve:mock` builds the app, applies D1 migrations to a throw-away local database and starts
`wrangler dev` on http://localhost:8787 with `MOCK_GOOGLE=1`. In mock mode the Worker serves an
in-repo fake Google: an OAuth consent page where you can untick scopes, plus fake Drive v3,
Tasks v1 and Calendar v3 APIs under `/__mock/`. For hot reload of the UI, run `pnpm dev` (Vite on
:5173 proxies `/api` and `/__mock` to :8787) next to `pnpm serve:mock`.

## Quality gates

| Command | What it does |
|---|---|
| `pnpm verify` | Runs everything below in order. Exits non-zero on any failure. |
| `pnpm typecheck` | `tsc -b`, strict, for app, Worker and tooling |
| `pnpm lint` | ESLint plus the style audit (no raw hex colours or px font sizes outside `src/theme/`) |
| `pnpm test` | Vitest: unit tests (jsdom) and Worker tests (`@cloudflare/vitest-pool-workers` with D1) |
| `pnpm e2e` | Playwright against `wrangler dev` in mock Google mode, including axe accessibility checks |
| `pnpm audit:brand` | Checks that no logo, icon or app-name strings exist outside the brand config, and that the app builds with an empty `public/brand/` |
| `pnpm screenshots` | Captures every screen and dialog in light/dark and compact/expanded into `screenshots/` |
| `pnpm new:service <id>` | Scaffolds a new Google service module |

CI (`.github/workflows/ci.yml`) runs `pnpm verify`.

## Manual setup for production

None of this is needed for development or tests.

1. **Google Cloud project.** No billing is needed. Enable the **Google Drive API**, **Google Tasks API** and **Google Calendar API**.
2. **OAuth consent screen.**
   - Choose **Internal** if only one Google Workspace organisation will use the app.
   - Otherwise choose **External**. The Tasks and Calendar scopes then need Google verification. While the app is in *Testing*, refresh tokens expire after 7 days, and users will see the in-app *Reconnect Google* prompt.
   - Add the scopes: `openid`, `email`, `profile`, `…/auth/drive.file`, `…/auth/tasks`, `…/auth/calendar.events.readonly`.
3. **OAuth client.** Create a *Web application* client with these authorised redirect URIs:
   - `http://localhost:8787/api/auth/callback`
   - `https://<your-domain>/api/auth/callback`
4. **Cloudflare.**
   - Create the database, then put the printed `database_id` into `wrangler.jsonc`:
     ```bash
     pnpm exec wrangler d1 create notes
     ```
   - Apply the migrations:
     ```bash
     pnpm exec wrangler d1 migrations apply DB --remote
     ```
   - Set `GOOGLE_CLIENT_ID` under `vars` in `wrangler.jsonc` (it isn't secret).
   - Add the client secret:
     ```bash
     pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
     ```
   - Add the token encryption key. Give it 32 random bytes in base64 with a version prefix. To rotate it later, put the new key first and keep the old one after it (`v2:<new>,v1:<old>`); stored tokens are re-encrypted with the new key when they're next used.
     ```bash
     node -e "console.log('v1:'+require('crypto').randomBytes(32).toString('base64'))" | pnpm exec wrangler secret put TOKEN_ENC_KEY
     ```
   - Make sure `MOCK_GOOGLE` is `"0"` in production. It is by default in `wrangler.jsonc`.
5. **Deploy.** Run `pnpm deploy` (build, remote migrations, then `wrangler deploy`). Add a custom domain in the Cloudflare dashboard. The old GitHub Pages `CNAME` has been removed.
6. **Branding.** Follow [docs/BRANDING.md](docs/BRANDING.md).

## Project layout

```
src/            React app
  brand/        brand config + build helpers (the only place the product name lives)
  theme/        M3 theme, tokens, seed-colour palettes
  services/     Google service registry + drive / tasks / calendar modules
  sync/         merge, outbox (IndexedDB), sync engine
  editor/       Tiptap editor, custom extensions, adaptive toolbar
worker/         Hono Worker: auth, sessions, token minting, mock Google (worker/mock)
migrations/     D1 schema
e2e/            Playwright specs (mock Google)
scripts/        verify, audits, scaffolding, mock server
docs/           branding, adding services, legacy behaviour spec
```

The privacy policy is served at `/privacy`. It states exactly what the backend stores; see
`src/views/privacyText.ts`, which must stay in sync with `migrations/`.
