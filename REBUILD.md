# Rebuild "Notes" from the ground up (React + Material UI + Google sign-in + Drive/Tasks/Calendar)

You are rebuilding the notes app in this repo (max-holley/notes). The current app is a single-file vanilla JS app (`index.html`, `design.css`, `editor-behavior.js`, `tests/editor.cjs`). Treat it as a **behavioural spec**, not code to port. All stack decisions below are final.

## Autonomy contract (read first)
This is a **fully unattended run**. I will not answer questions and will only review the finished result.
- **Never stop to ask or confirm.** When something is ambiguous, pick the most reasonable option, keep going, and append a line to `DECISIONS.md` (decision, alternatives, why).
- **Never stop on a blocker you can route around.** Missing credentials, Google consent, domain, or real devices are not blockers: build against the mock layer (below) and document the manual step in the README.
- Maintain `PROGRESS.md` (phase checklist + what's next + known issues), updated and committed after every phase, so you can recover cleanly after context compaction. Re-read it whenever you resume.
- Work on branch `rebuild/mui`. One commit per phase, each green (`pnpm typecheck && pnpm lint && pnpm test && pnpm e2e`). If a phase can't go green after a reasonable effort, record it in `PROGRESS.md` under Known issues, and continue.
- Use subagents for independent work (e.g. test writing, legacy-code exploration, final review) to keep the main context lean.
- Do not finish until the **Definition of Done** (bottom) is fully met. Then write `REPORT.md`: what was built, what was tested and how, what is untested (real Google OAuth, real devices), decisions made, manual setup steps.
- First action: explore the legacy code, write `PLAN.md`, and immediately start phase 1. Do not wait for approval.
- Never run destructive commands outside this repo. Never commit secrets.

## Stack (fixed)
- **Frontend:** Vite + React 19 + TypeScript (strict). **MUI v7** + `@mui/icons-material` (Outlined variant only). Theme via `createTheme({ cssVariables: true, colorSchemes: { light: true, dark: true } })`. Tiptap (ProseMirror) editor with custom extensions (do not hand-roll contentEditable). Zustand, `@dnd-kit`, DOMPurify, `@fontsource/*` (self-hosted fonts, no font CDN).
- **Backend:** one **Cloudflare Worker** (Hono, TypeScript) serving both the API (`/api/*`) and the built frontend (Workers static assets), so everything is same-origin. **D1** for account data. Wrangler config, migrations in `migrations/`. Secrets via `wrangler secret` (never in repo).
- Tests: Vitest (unit; `@cloudflare/vitest-pool-workers` for the Worker), Playwright (e2e). pnpm. GitHub Actions CI; deploy script via `wrangler deploy`.

## Backend: accounts and connection info only (never note data)
Purpose: reliable cross-device sign-in, durable Google connection (refresh tokens), device sessions, and per-user service grants. **Notes, tasks content, calendar data and images never pass through or are stored on the backend**; the browser talks to Google APIs directly using short-lived access tokens the Worker mints.
- **Auth flow:** OAuth 2.0 authorization-code + PKCE, run by the Worker. `GET /api/auth/start` builds the Google URL (`access_type=offline`, `include_granted_scopes=true`, signed `state` carrying PKCE verifier + return path so deep links survive). `GET /api/auth/callback` exchanges the code (client secret is a Worker secret), upserts the user, stores the encrypted refresh token, creates a session, sets cookie, redirects.
- **Sessions:** random 256-bit session id in an `HttpOnly; Secure; SameSite=Lax` cookie; only its SHA-256 hash stored in D1; sliding 60-day expiry; one row per device (store coarse user-agent label, created/last-seen). CSRF: SameSite + `Origin` check + required custom header on state-changing routes. Basic rate limiting on auth routes.
- **Endpoints:** `GET /api/me`; `POST /api/auth/logout`; `GET/DELETE /api/sessions[/:id]` (list/revoke devices); `GET /api/token?scopes=...` returns a short-lived Google access token for the caller's granted scopes (cache server-side until ~5 min before expiry; never log tokens); `POST /api/services/connect` (returns Google URL for incremental scope grant); `DELETE /api/account` (revoke at Google, delete all rows, optionally trash the Drive `Notes` folder client-side first).
- **D1 schema:** `users(id, google_sub UNIQUE, email, name, picture_url, created_at, last_seen_at)`, `grants(user_id, scopes, refresh_token_enc, iv, updated_at)`, `sessions(id_hash, user_id, created_at, last_seen_at, expires_at, device_label)`. Refresh tokens encrypted with AES-GCM (key from a Worker secret, versioned for rotation). Nothing else about the user is stored. State this precisely in the privacy page.
- If Google reports a refresh token as revoked/expired, mark the grant invalid and make the UI show a non-blocking "Reconnect Google" prompt; edits stay safely queued meanwhile.
- **Mock mode** (`MOCK_GOOGLE=1` for dev and tests): a fake Google OAuth server + fake Drive v3 / Tasks v1 / Calendar v3 implemented as an in-repo service so the whole app and all e2e tests run with no Google credentials. Real Google is used only when `GOOGLE_CLIENT_ID/SECRET` are set.

## Google services framework (extensible by design)
Every Google service is a self-contained module registered in one place; adding one later must be a small, documented change.
- `src/services/<id>/` exports a `GoogleService` object: `id`, `label`, `icon`, `scopes[]`, `apiClient` factory (uses the shared token provider and authenticated fetch with retry/backoff/401-refresh), `navDestinations` (optional drawer/rail entries), `settingsPanel` (connect/disconnect, options), `syncHooks`, and `onNoteChange` hooks. One registry file lists them. The sign-in scope request, backend scope allow-list, CSP `connect-src`, nav, settings and onboarding are all **derived from the registry**, never hard-coded elsewhere.
- Ship three modules: `drive` (required), `tasks`, `calendar`. Granular consent: sign-in requests all three; if the user unticks one, the app works and that service shows a "Connect" state. Incremental grants later via `/api/services/connect`.
- Write `docs/ADDING_A_GOOGLE_SERVICE.md` and a scaffold command `pnpm new:service <name>`; include a throwaway test proving a dummy service can be registered with no edits outside its folder + the registry.

## Design system: "looks like Google made it"
- Material Design 3 look via a single MUI theme in `src/theme/`. **No raw hex colours, px font sizes or ad-hoc CSS outside theme tokens/`sx`** (lint or grep test enforces this).
- Tonal surfaces, M3 shapes (small 8, medium 12, large 16-28, full for chips/FAB), Roboto default, M3 type scale mapped to MUI typography, standard state layers and ripple. Accent: keep the accent-swatch feature; generate light/dark palettes from a seed with `@material/material-color-utilities`. Theme: Auto / Light / Dark.
- Only MUI components for UI (AppBar, Drawer, List, Accordion, Chip, Dialog, Menu, Snackbar, Tooltip, ToggleButtonGroup, Fab, TextField, Switch, Skeleton, Tabs, BottomNavigation, etc.).
- Responsive M3 window classes: compact (<600) single pane + bottom nav/drawer; medium (600-839) rail + list/editor; expanded (>=840) permanent sidebar + list + editor.
- WCAG 2.2 AA, full keyboard support, `prefers-reduced-motion` respected.
- End-of-build consistency review: screenshot every screen, dialog and menu in light + dark, compact + expanded; fix any inconsistent spacing, radius, icon style or typography.

## Fully unbranded
- **Delete** every existing logo, icon, favicon, apple-touch icon, manifest icon and wordmark asset (`Logo*.png`, `icon*.png`, `icon.svg`, `favicon*`, `apple-touch-icon.png`, icon references in `manifest.webmanifest`, `index.html`, README, privacy page). Remove `CNAME` (hosting moves to Workers).
- Introduce **one** brand config, `src/brand/brand.config.ts` + `public/brand/` (all optional files): `appName` (default placeholder `"Notes"`), `logo` (svg/png, optional), `favicon.ico`/`favicon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `themeColor`. A build step generates `<link>` tags and `manifest.webmanifest` **only from files that exist**; with none present the app shows the plain text name, no logo, no favicon, and a valid manifest without icons. The landing page, app bar, drawer, auth screens, emails/privacy page and `<title>` must all read from this config (grep test: no hard-coded app name or brand asset path outside it).
- Add `docs/BRANDING.md`: exactly which files to drop in and which config fields to set later.
- Do not invent a replacement logo or use a Material icon as a logo substitute.

## Storage and sync (Drive is the only note store)
- Network destinations allowed: own origin, `googleapis.com` APIs for the registered services, `accounts.google.com` (redirect only). No analytics, CDNs or third-party calls. Strict CSP derived from the registry.
- Drive layout (scope `drive.file`) in My Drive: `Notes/notes-file.json` (notes, categories, tags, prefs, tombstones, task/event link maps) and `Notes/images/<id>`; tag files with `appProperties` so they're found even if renamed.
- **Local storage is temporary only:** IndexedDB holds an **outbox of unsynced changes** (survives reload/offline/crash) plus the session working copy; entries are removed once Drive confirms; all wiped on sign-out/disconnect. Other allowed local keys: theme + font name (flash prevention) and a "signed in before" hint. App start = pull from Drive, apply outbox on top.
- Sync engine (rebuild in TS with unit tests; design proven in my Apps Script version): per-item `updatedAt` last-writer-wins merge; **tombstones** (90 days) so deletes never resurrect; debounce 3 s, max-wait 20 s while typing, one request in flight, retry with backoff 5-60 s, flush on `visibilitychange`/`pagehide`; read-merge-write against latest remote before every push using `headRevisionId`/`modifiedTime`; pull on focus if >30 s stale and every 5 min; `navigator.locks` + BroadcastChannel for multi-tab; status chip (Synced / Saving / Offline - will retry / Needs reconnect) and Sync now (Ctrl+S); warn at ~40 MB.
- **Images:** compress on insert (max 1600 px long edge, WebP/JPEG ~0.8), upload as separate Drive files, lazy-load via authenticated blob URLs, garbage-collect orphans.
- **Recently deleted:** 30-day trash with restore / delete forever, on the tombstone/soft-delete model.

## Front page and auth UX
- Logged-out users see a landing page (hero, 3-4 highlights covering notes, Drive-only storage, Tasks and Calendar, privacy note stating exactly what the backend stores, footer privacy link) with one primary button **Continue with Google** (sign up = sign in). No email/password anywhere. No logo (see Unbranded).
- Signed-in app-bar menu: account, Settings, Devices (list/revoke sessions), Sign out, **Disconnect & delete data** (typed confirmation; revokes Google grant, deletes account rows, optionally trashes Drive `Notes` folder, wipes local data).
- Route guard `/` landing, `/app` workspace; deep links like `/app?note=<id>` survive sign-in.

## Features to carry over (behave the same unless noted)
Notes list with search, pin, archive/unarchive (notes and categories, including the "restore / keep archived / delete notes" choice), categories with colours (create/edit/archive/delete, drag note onto category), tags (pills, manager, cloud/filter), stats, sort toggle created vs updated (persisted), empty states, new note (Ctrl+N), mobile layout.
Editor: H1-H3, body, quote, bold/italic/underline/strike, inline code + code blocks, bullet/numbered lists, checklists, links (edit popover + copy link; right-click menu: copy link, copy text, open in new tab, edit, remove), highlight and text colour, indent/outdent, alignment, horizontal rule, tables (grid picker; row/column context menu; Tab navigation, Tab in last cell adds row), images (paste/drop/insert), **sections** (Info/Note/Success/Warning/Error, "Insert Section" wording, click the section icon to change type), clear formatting.
Keyboard (keep exactly): Enter on final empty line exits section/quote; Ctrl/Cmd+Enter inserts a divider with cursor on the next line (or exits a block); Arrow Up/Down at a block edge moves outside; empty checklist item exits list; Backspace at start of a section unwraps it; Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y; Ctrl+Alt+0-4 block styles; Ctrl+Shift+7/8/9 lists; Escape closes menus/dialogs.
Import/Export: JSON (all) and Markdown (open note or all; `# Title` becomes title; `- [ ]` checklists; sections as `> [!INFO]`); import accepts .json and .md together, plus the legacy JSON shape and the Apps Script version's Drive file shape.
Safety/perf: DOMPurify on every path rendering note HTML; animated note-list add/remove (fade then slide; snap on rapid clicks and reduced motion); per-user data isolation.
Spellcheck: custom right-click menus must not suppress the browser's native spelling menu (only intercept non-text targets, or with Ctrl/Shift, or provide in-app suggestions).
**Send to Google Doc:** convert the open note to a Google Doc in the user's Drive (`drive.file` upload-convert), then open it.

## New features requested
1. **Collapsible Categories and Tags** in the sidebar (MUI Accordion): counts, remembered expanded state (synced prefs), active filter visible when collapsed, add/manage actions in headers.
2. **Font picker:** Settings → Font dialog, live app-wide preview, Save/Cancel/Escape reverts; applies to all UI and note content (code stays monospace). ~10 `@fontsource` fonts (Roboto default, Inter, Open Sans, Lato, Noto Sans, Source Sans 3, Roboto Serif, Merriweather, Roboto Mono, System). Synced in prefs; applied before first paint.
3. **Improved note toolbar:** grouped (Text style | Inline | Lists | Insert | Align/Colour | Undo/Redo), single adaptive row with overflow "more" menu, tooltips with shortcuts, active states, sticky, compact on mobile.
4. **Customisable toolbar:** Customise dialog (also right-click on toolbar): show/hide every control, add/remove, drag reorder (dnd-kit + keyboard + up/down buttons), group separators, Reset to default; stored in synced prefs; always recoverable even if all hidden.

## Google Tasks integration (module `tasks`, scope `https://www.googleapis.com/auth/tasks`)
- Any checklist line can be a **task line** (toggle/slash command). It creates a Google Task in a dedicated list (default name `Notes`, configurable); the line stores `taskId`, and the task description holds a deep link `/app?note=<id>`. The note↔task link map lives in the Drive file, not the backend.
- **Bidirectional:** completing in either place updates the other; renaming a task in Google Tasks updates the note line; edits to the line update the task title. Reconcile on focus and every 5 min.
- **Due dates:** a clickable calendar-icon chip on the right of the task line opens a date picker (MUI date picker) plus a right-click due-date menu. Dates sync to Google Tasks.
- **Safe deletion:** a Google Task is deleted only when its line has been absent from **every** note for 60 s (configurable constant), which also survives cut/paste between notes and undo. Show an Undo snackbar.
- **Tasks view:** a drawer/rail destination (not hover). Tasks grouped by originating note title, groups ordered by most urgent task, dated tasks before undated within each group, with overdue / today / upcoming indicators; click opens the note at that line; complete/set due date inline.

## Google Calendar integration (module `calendar`, scope `https://www.googleapis.com/auth/calendar.events.readonly`, read-only)
- **New meeting note:** pick from today's events (with a date picker/next-7-days) to create a note pre-filled with title, date/time, attendees, conference link, and sections Agenda / Actions / Decisions (Actions as task lines). Store `eventId` on the note; "Open event" link; "Refresh details" re-pulls attendees/time.
- A compact **Today** agenda panel in the sidebar/drawer listing events with a one-click create-meeting-note action.
- Calendar module must degrade gracefully when not granted (Connect prompt).

## Quality gates
- Provide two root scripts: `pnpm verify` (runs typecheck, lint, unit, e2e in mock mode, and `audit:brand`; exits non-zero on any failure) and `pnpm audit:brand`. Print their full output when you run them, because a separate evaluator judges completion only from what appears in the conversation.
- Unit tests: sync merge/tombstones/outbox/backoff, token-expiry + revoked-grant paths, Worker auth flow (PKCE, state tampering, CSRF, session expiry/revocation, encryption round-trip, rate limit), service registry (dummy service), tasks reconciliation + 60 s deletion grace, calendar → note template, import/export round-trips, toolbar layout reducer, prefs migration, brand-config build (with and without assets).
- E2E (Playwright, mock Google): port every scenario from `legacy/tests/editor.cjs` plus landing → sign-in → app, sign-in on a "second device" sees the same data, device revoke, sign out wipes local data, offline edit then reconnect, two-tab conflict, sidebar collapse persistence, font change, toolbar customise, recently deleted, image compression, task line lifecycle (create/complete/rename/due/delete-with-grace), meeting note from event, granular-consent-denied states.
- axe accessibility checks on landing, workspace and every dialog.
- Security pass: CSP, sanitiser coverage, tokens never in localStorage/logs, refresh tokens encrypted, scopes exactly as registered, no secrets in repo, dependency audit.
- Brand audit: grep proves zero logo/icon/favicon/brand strings outside `brand.config.ts` and `public/brand/`; app runs and builds with an empty `public/brand/`.

## Phases
1. Scaffold, tooling, CI, M3 theme, brand config (unbranded), responsive shell, mock Google service.
2. Backend: Worker, D1 migrations, auth/session/token endpoints, encryption, tests; landing page, sign-in/out, devices, disconnect & delete.
3. Google services framework + `drive` module + sync engine + outbox + status UI.
4. Notes list, categories, tags (collapsible sidebar), search/sort/pin/archive, recently deleted.
5. Tiptap editor, custom extensions, keyboard behaviours, grouped adaptive toolbar.
6. Toolbar customisation, font picker, settings, import/export, Send to Google Doc, images.
7. `tasks` module and Tasks view.
8. `calendar` module, meeting notes, Today panel; `docs/ADDING_A_GOOGLE_SERVICE.md` + `pnpm new:service`.
9. Port/extend e2e, a11y, consistency screenshot review, security + brand audits, privacy page, README (setup/deploy), remove `legacy/`, fresh-eyes review by a separate subagent (fix what it finds), `REPORT.md`.

## Definition of Done
All phases committed; `typecheck`, `lint`, unit and e2e all green in mock mode; consistency screenshots reviewed; brand audit passes; `legacy/` removed; README + `docs/` written; `REPORT.md` written. Nothing in the repo requires my input to build or test.

## Manual steps for me afterwards (document in README, do not block on them)
Google Cloud project (no billing): enable Drive, Tasks and Calendar APIs; OAuth consent screen (**Internal** if Healios Workspace-only, otherwise External, which needs Google verification for the Tasks and Calendar scopes, and refresh tokens expire after 7 days while the app is in Testing); Web client with redirect URIs `http://localhost:8787/api/auth/callback` and the production callback; `wrangler d1 create`, `wrangler d1 migrations apply`, `wrangler secret put` for `GOOGLE_CLIENT_SECRET` and `TOKEN_ENC_KEY`, set `GOOGLE_CLIENT_ID`; `wrangler deploy`; add branding per `docs/BRANDING.md`.
