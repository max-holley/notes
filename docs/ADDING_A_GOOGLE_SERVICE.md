# Adding a Google service

Every Google integration is a self-contained module in `src/services/<id>/` plus **one line** in
`src/services/registry.ts`. Nothing else needs editing: sign-in scopes, the Worker's scope
allow-list, the CSP `connect-src`, navigation, sidebar panels, Settings and onboarding text are all
derived from the registry.

## 1. Scaffold

```bash
pnpm new:service keep --label "Google Keep" --scope https://www.googleapis.com/auth/keep --origin https://keep.googleapis.com
```

This creates:

| File | What it is |
|---|---|
| `src/services/keep/manifest.ts` | Pure data (no React): `id`, `label`, `description`, `scopes[]`, `apiOrigins[]`, optional `required`. The Worker imports this. |
| `src/services/keep/index.tsx` | The UI module: default export of a `GoogleService` (see `src/services/types.ts`). |

…and adds `keepManifest` to `serviceManifests` in `src/services/registry.ts`.

## 2. Fill in the manifest

- **scopes** – request the narrowest scope that works. Every scope in the registry is requested at
  sign-in (users can untick optional ones on the consent screen) and is the only set the Worker will
  mint tokens for (`/api/token` rejects anything else with `scope_not_registered`).
- **apiOrigins** – every origin the browser will call. These become the CSP `connect-src`. In mock
  mode the client rewrites them to `/__mock/googleapis` automatically (`apiUrl()` in `src/services/http.ts`).
- **required** – only for services the app cannot work without (Drive). Required services cannot be
  disconnected.

## 3. Build the module (`index.tsx`)

```ts
const keep: GoogleService<typeof client> = {
  ...keepManifest,
  icon: StickyNote2Outlined,               // Outlined Material icon
  apiClient: () => client,                 // use authJson/authFetch from ../http.ts
  navDestinations: [{ id: 'keep', label: 'Keep', icon: StickyNote2Outlined, component: KeepView }],
  sidebarPanels: [{ id: 'keep-recent', label: 'Keep', component: KeepPanel }],
  settingsPanel: KeepSettings,             // extra options; Connect/Disconnect is generic
  dialogs: KeepDialogs,                    // mounted once in the workspace
  noteMenuItems: KeepNoteMenu,             // items in the open note's "more" menu
  syncHooks: { onStart, onFocus, onInterval }, // called by the app's sync lifecycle
  onNoteChange: (noteIds) => {},           // local note edits
  onboarding: 'One sentence for the landing page / consent explainer.',
};
export default keep;
```

Rules:

- **Never** call `fetch` with your own token handling. Use `authJson(url, { scopes })` /
  `authFetch(...)`: they get short-lived tokens from `/api/token`, retry with backoff on 429/5xx/network
  errors, refresh once on 401, and surface `ScopeNotGrantedError` / `ReconnectRequiredError`.
- Data that must sync across devices belongs in the Drive file (`NotesDoc`), never on the backend.
- Degrade gracefully when not granted: check `useUi((s) => s.me?.services.includes('<id>'))` and
  show a Connect button that calls `connectService('<id>')` (incremental consent via
  `/api/services/connect`).
- UI uses MUI components and theme tokens only (`pnpm lint` runs the style audit).

## 4. Mock it

Add the endpoints you call to `worker/mock/routes.ts` (gated by `MOCK_GOOGLE=1`) so e2e tests run
without credentials, and add a Playwright spec under `e2e/`.

## 5. Test

`src/services/registry.test.ts` proves a dummy service is picked up by every derived list without
edits outside its folder and the registry. Add unit tests for your module's pure logic next to it.

## 6. Google Cloud

Enable the API in your Google Cloud project and add the scope to the OAuth consent screen
(sensitive/restricted scopes need Google verification for External apps).
