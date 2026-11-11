# Rebuild report

Branch `rebuild/mui`. The single-file vanilla-JS app has been replaced with a React 19 + MUI v7
(Material Design 3) app served by one Cloudflare Worker (Hono + D1). Notes are stored only in the
user's Google Drive. Google Tasks and Google Calendar are pluggable service modules. `legacy/` has
been removed; its behaviour is summarised in `docs/LEGACY_SPEC.md`.

## What was built

**Backend (`worker/`, `migrations/`)**
- OAuth 2.0 authorization code + PKCE (S256), run by the Worker:
  - The `state` is sealed with AES-GCM, so it is both encrypted and authenticated. It carries the PKCE verifier and the return path, and is bound to a short-lived nonce cookie (login CSRF protection).
  - Requests use `access_type=offline` and `include_granted_scopes=true`.
  - If Google sends no refresh token and none is on file, the Worker asks again with forced consent.
- D1 has three tables, exactly as specified: `users`, `grants`, `sessions`. The only addition is a `grants.invalid_at` flag.
- Refresh tokens are encrypted with AES-GCM:
  - The user id is the AAD, so a token can't be moved to another account.
  - Keys are versioned (`v2:<b64>,v1:<b64>`) and re-encrypted with the current key on next use.
- Sessions:
  - The session id is 256 bits of randomness. Only its SHA-256 hash is stored.
  - Cookie flags: HttpOnly, Secure, SameSite=Lax.
  - Expiry slides to 60 days, written at most hourly.
  - One row per device, with a coarse label such as "Chrome on Windows".
  - Devices can be listed and revoked.
- CSRF defence on every state-changing route: the SameSite cookie, an exact `Origin` match, and a required `X-Requested-With` header.
- Auth routes have a fixed-window per-IP rate limit.
- `/api/token` mints short-lived access tokens:
  - Only for scopes that are both registered and granted.
  - Cached in isolate memory until 5 minutes before expiry. Never written to the database or logs.
  - `?force=1` skips the cache after Google returns a 401.
  - An `invalid_grant` from Google marks the grant invalid, and the UI then shows a non-blocking **Reconnect Google** banner. Edits stay queued meanwhile.
- `DELETE /api/account` revokes access at Google and deletes all rows. The client can also move the Drive `Notes` folder to the trash and wipe local data.
- Static assets are served by the same Worker with a strict CSP built from the service registry, plus `nosniff`, `Referrer-Policy`, `Permissions-Policy` and `COOP`.
- **Mock Google** (`MOCK_GOOGLE=1`, `worker/mock/`) implements:
  - an OAuth consent page with per-scope checkboxes and a token endpoint, called in-process;
  - Drive v3 (files list/get/create/update, multipart, media upload, `q` subset, Docs conversion);
  - Tasks v1 and Calendar v3 (read-only);
  - test control endpoints.

  The whole app and every e2e test run without Google credentials.

**Google services framework (`src/services/`)**
- `registry.ts` lists pure-data manifests. UI modules are discovered as `./<id>/index.tsx`.
- Everything below is derived from the registry: sign-in scopes, the Worker allow-list, CSP `connect-src`, nav destinations, sidebar panels, Settings, dialogs, note-menu items, sync hooks and onboarding text.
- Shared token provider plus `authFetch`: retries with backoff on 429/5xx/network errors, refreshes once on 401, and maps typed errors.
- `pnpm new:service <id>` scaffolds a module. `docs/ADDING_A_GOOGLE_SERVICE.md` documents the process.
- `src/services/registry.test.ts` proves a dummy service is picked up with no edits outside its folder and the registry.

**Drive storage and sync (`src/sync/`, `src/services/drive/`)**
- Files: `Notes/notes-file.json` and `Notes/images/*`, found by `appProperties` (`drive.file` scope).
- Merge rules:
  - per-item last-writer-wins on `updatedAt`;
  - tombstones kept for 90 days;
  - Recently deleted is a 30-day soft delete;
  - prefs are merged as one item.
- Local storage:
  - The IndexedDB outbox holds one entry per item. An entry is removed only when Drive confirms that exact version.
  - The working copy is also in IndexedDB.
  - Both are wiped on sign-out or disconnect.
- Sync engine:
  - debounce 3 s, max wait 20 s, one request in flight;
  - backoff from 5 s to 60 s;
  - read, merge, then write against the latest remote before every push;
  - pull on focus when the last sync is more than 30 s old, and every 5 minutes;
  - flush on `visibilitychange` and `pagehide`;
  - `navigator.locks` and BroadcastChannel coordinate multiple tabs;
  - warns when the file passes ~40 MB.
- Status chip shows Synced / Saving… / Offline – will retry / Needs reconnect. Ctrl+S syncs now.
- Images are compressed to a 1600 px long edge as WebP (JPEG fallback) at 0.8 quality and stored as separate Drive files. They are lazy-loaded through authenticated blob URLs, and orphans are moved to the Drive trash.
- Send to Google Doc uses `drive.file` upload-convert, then opens the new Doc.

**UI**
- One M3 theme (`src/theme/`):
  - palettes generated from a seed with `@material/material-color-utilities`, plus 8 accent swatches;
  - Auto / Light / Dark;
  - M3 type scale and shapes;
  - CSS variables, so there is no flash: `public/boot.js` applies mode and font before React loads.
- Lint fails on raw hex colours or px font sizes outside `src/theme/`.
- Window classes:
  - compact: single pane, bottom nav, modal drawer, FAB;
  - medium: navigation rail plus list and editor;
  - expanded: permanent drawer plus list and editor.
- Landing page with *Continue with Google*, an accurate statement of what the server stores, and a privacy link. Route guard and deep links (`/app?note=<id>`) survive sign-in.
- Account menu: Settings, Devices, Sign out, and **Disconnect & delete data** with a typed confirmation.
- Notes and organising:
  - search, pin, archive, sort by created or updated (persisted);
  - categories with colours: create, edit, reorder, archive (with the restore / keep / delete choice), delete, and drag a note onto a category;
  - tags with a picker, manager and AND filter;
  - collapsible sidebar Categories / Tags / Today sections, remembered in synced prefs, with the active filter shown when collapsed;
  - stats, Recently deleted, and an animated list (collapse with snap on rapid changes and reduced motion).
- Tiptap editor:
  - headings, quote, marks, inline code and code blocks, lists and checklists;
  - links with an edit popover, a chip, and a right-click menu;
  - highlight and text colour, indent, alignment, divider, tables (grid picker, Shift/Ctrl+right-click row/column menu, Tab navigation);
  - images, **Sections** (Info / Note / Success / Warning / Error; click the icon to change type), clear formatting;
  - every keyboard behaviour in the brief (`src/editor/extensions/keyboard.ts`).
- Grouped adaptive toolbar: overflow menu, tooltips with shortcuts, active states, sticky. Its Customise dialog supports show/hide, dnd-kit drag plus keyboard reordering, up/down buttons, separators and reset. The tune button and right-click always keep it recoverable.
- Font picker with live preview across the whole app. Save, Cancel and Escape work as expected, code stays monospace, and the choice syncs and applies before first paint. Ten self-hosted `@fontsource` fonts are available.
- Import/export:
  - JSON (all notes) and Markdown (the open note or all notes);
  - `# Title` becomes the title, `- [ ]` checklists, `> [!INFO]` sections;
  - import accepts `.json` and `.md` files together, plus the legacy v2 JSON and Apps Script Drive file shapes.
- DOMPurify runs on every load, save, import and export path, with an attribute/style allow-list.
- Spell check: a plain right-click on prose keeps the browser menu (only links are intercepted; tables need Ctrl or Shift).

**Google Tasks**
- Any checklist line can become a task line, using the toolbar button, a slash command (`/task `), or Ctrl+Shift+9 then the button. The line stores `taskId` and `lineId`, and the task notes hold a deep link back.
- The link map lives in the Drive file.
- Reconcile is 3-way (line ↔ snapshot ↔ Google): renames, completion and due dates sync both ways, and conflicts go to the newer side.
- The due-date chip has a calendar popover and a right-click menu (Today / Tomorrow / Next week / Pick / Clear / Stop syncing).
- Deletion is safe. A task is deleted only after its line has been missing from every note for 60 s, which also covers cut/paste and undo, and an Undo snackbar recreates it.
- Tasks view: grouped by note, groups ordered by most urgent, dated before undated, with overdue / today / upcoming indicators. Tasks can be completed or given a date inline, and clicking one opens the note at that line.

**Google Calendar (read-only)**
- Today panel in the sidebar with one-click meeting notes.
- Meeting-note dialog with a date picker and the next 7 days.
- Meeting notes are pre-filled with time, attendees, conference link, and Agenda / Actions (as task lines) / Decisions. Each stores its `eventId`, and the note menu has *Open event* and *Refresh details*.
- When Calendar isn't granted, the panel shows a Connect button that starts an incremental grant.

**Unbranded**
- All logo, icon and manifest assets and `CNAME` were deleted.
- `src/brand/brand.config.ts` plus optional `public/brand/` files are the only branding inputs. The Vite plugin builds `<head>` tags and `manifest.webmanifest` from whichever files exist.
- `pnpm audit:brand` checks the whole repo and a real build.
- See `docs/BRANDING.md`.

## How it was tested

`pnpm verify` runs typecheck → lint (ESLint plus the style audit) → unit (Vitest) → e2e
(Playwright, mock Google) → brand audit, and exits non-zero on any failure. Its full output is in
the session transcript.

- **Worker tests** (`@cloudflare/vitest-pool-workers`, real D1 with migrations):
  - PKCE and the authorize URL;
  - sealed-state tampering, expiry, and the nonce/login-CSRF check;
  - CSRF (Origin + header);
  - session hashing, cookie flags, sliding expiry, expiry and revocation;
  - AES-GCM round trip, AAD binding, key rotation;
  - rate limit;
  - token caching, early refresh, scope enforcement, revoked-grant → reconnect;
  - incremental connect;
  - account deletion.
- **Unit tests** (jsdom):
  - sync: merge, LWW, tombstones, trash expiry, outbox confirm semantics (fake-indexeddb), debounce, max-wait, single-flight, backoff, reconnect, stale pull;
  - prefs migration and the toolbar layout reducer;
  - tasks: reconcile in every direction, 60 s grace, cut/paste, deleted-in-Google, unreachable remote, due dates, grouping;
  - the calendar → note template;
  - import/export round trips (Markdown, JSON, legacy v2, Apps Script shape);
  - sanitiser coverage and the token provider (expiry, revoked grant, 401 retry);
  - the service registry with a dummy service, and the brand-config build with and without assets.
- **E2E** (Playwright, Chromium, against `wrangler dev` with mock Google):
  - every scenario from `legacy/tests/editor.cjs`, adapted to the new UI;
  - landing → sign-in → app, deep links, second device, device revoke, sign-out wipe, revoked grant → reconnect, disconnect & delete;
  - granular consent denied for Tasks and Calendar;
  - offline edit then reconnect, two-tab convergence;
  - sidebar collapse persistence, font change, toolbar customise (including keyboard reordering), recently deleted, image compression;
  - the task line lifecycle, including the real 60 s grace and Undo; cut/paste between notes; the Tasks view; meeting notes;
  - axe (WCAG 2.2 AA tags) on landing, privacy, workspace, Tasks, Recently deleted and every dialog, in light and dark, plus a compact viewport;
  - keyboard-only flows;
  - CSP and headers, no third-party requests, no inline scripts, no tokens in web storage, cookie flags, CSRF, per-user isolation.
- **Consistency review**: `pnpm screenshots` captured 77 screens, dialogs and menus in light and dark, compact and expanded, plus the medium rail. I reviewed them and fixed these:
  - stats footer typography;
  - zero-count badge on Today;
  - section borders;
  - duplicated landing copy;
  - toggle-button contrast;
  - list semantics and nested interactive controls (found by axe).
- **Security pass**:
  - `pnpm audit --prod`: no known vulnerabilities;
  - no secrets in the repo (grep);
  - tokens only in memory;
  - refresh tokens encrypted;
  - scopes exactly as registered (asserted in a test).
- **Fresh-eyes review** by a separate agent. Findings and fixes are listed under *Review findings* below.

## Not tested / needs a human

- **Real Google OAuth and APIs.** Everything ran against the in-repo mock. The real endpoints are a thin `fetch` layer (`worker/google.ts`, `src/services/*/client.ts`). Field names follow Google's documented REST shapes but haven't been exercised against Google.
- **Real devices and browsers.** The suite runs on desktop Chromium only, with emulated viewports. Safari and Firefox, touch drag on real phones, virtual keyboards and installed PWAs were not tested.
- **Cloudflare deployment** (`wrangler deploy`, remote D1) was not run.
- Drive revision races between two devices writing in the same second are handled by read, merge, write and LWW. There is no `If-Match`, because Drive media updates don't support it reliably.

## Decisions

See `DECISIONS.md`. Key ones:
- TS 5.9 and Vitest 4.1 for tool compatibility.
- The mock lives inside the Worker.
- The registry holds manifests, and the UI is discovered by glob.
- OAuth state is sealed.
- Access tokens are cached in memory, with a force-refresh path.
- `editedAt` and `updatedAt` are separate fields.
- Integrations patch open notes through the live editor.
- Undo recreates deleted tasks.
- Trashed notes keep their tasks.
- The spell-check-friendly context menu rule.

## Manual setup

See README → *Manual setup for production*:
- Google Cloud project, APIs and consent screen (Internal vs External and verification, 7-day refresh tokens while in Testing);
- the OAuth client and redirect URIs;
- `wrangler d1 create`, `migrations apply` and `secret put` for `GOOGLE_CLIENT_SECRET` and `TOKEN_ENC_KEY`;
- `GOOGLE_CLIENT_ID`;
- `pnpm deploy`;
- branding per `docs/BRANDING.md`.

## Review findings

A separate agent reviewed the code with fresh eyes and reported 11 issues. All of them are fixed and covered by tests:

1. **A transient Drive error could create a second `notes-file.json`.** `pull()` now treats only a 404 or a trashed file as "missing". Everything else is rethrown as an error to retry.
2. **Pushes didn't check `baseRev`.** `push()` now re-reads `headRevisionId` and throws `ConflictError` if the file moved since the pull. The engine then re-runs read-merge-write straight away (unit test added).
3. **Real Google returns `userinfo.*` identity scopes.** These are now normalised. The forced-consent re-auth always includes `openid email profile`, and an id_token without a sub or email is rejected.
4. **Open redirect through `return=/	/evil.com`.** `safeReturn` now rejects whitespace, control characters and backslashes, and also checks the origin with a URL parse (test added).
5. **Clock skew could resurrect deleted items.** A tombstone's `deletedAt` is now `max(now, item.updatedAt + 1)` (test added).
6. **A partial failure in the Tasks reconcile could create a duplicate task.** The task id is now written into the line immediately after each insert.
7. **Tasks reconcile wasn't locked across tabs.** It now runs under `navigator.locks` (`tasks-reconcile-<user>`).
8. **Deletes from another tab came back.** `applyForeign` now uses `applyChanges`, which writes tombstones (test added).
9. **Sign-out didn't wipe other tabs.** It now broadcasts `signout`, and other tabs wipe local data and go to the landing page.
10. **Outbox `confirm` could drop a newer edit.** The compare and the delete now run in one IndexedDB transaction.
11. **Connecting a service with a different Google account.** The connect flow now sends `login_hint`, and the callback rejects a mismatched account with `auth_error=account_mismatch` (Worker test added).

Two smaller design notes from the review:
- **Image clean-up only read the first page of Drive results.** It now pages through all of them.
- **`taskListId` merge.** The first list id that reaches Drive wins. Changing the list name in Settings clears the id locally and the next reconcile picks or creates the new list. A concurrent change from two devices resolves to one of the two lists.
