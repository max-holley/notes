# Decisions log

| # | Decision | Alternatives | Why |
|---|---|---|---|
| 1 | TypeScript 5.9 (not 7.x) | TS 7 native | typescript-eslint peer range is `<6.1`. |
| 2 | Vitest 4.1 + `@cloudflare/vitest-pool-workers` 0.23 | Vitest 5 + renamed `@cloudflare/vitest-plugin` | REBUILD.md names pool-workers; it requires vitest ^4.1. |
| 3 | Mock Google runs inside the Worker under `/__mock/*`, gated by `MOCK_GOOGLE=1` | Separate Node mock server | Same-origin, no extra process, CSP stays `'self'` in mock mode; worker calls mock OAuth in-process (no self-fetch). |
| 4 | Registry lists pure-data manifests; UI modules found by `import.meta.glob('./*/index.tsx')` | Registry imports full modules | Worker must derive scope allow-list + CSP from the registry without bundling React. Adding a service is still "its folder + one registry line". |
| 5 | Legacy has no sort toggle / stats beyond word count; implemented REBUILD.md's versions (sort created/updated persisted in prefs; stats = words/chars + note counts) | — | REBUILD.md asks for them. |
| 6 | "Panels" in legacy are called "Sections" everywhere in new UI ("Insert Section") | — | REBUILD.md wording. |
| 7 | OAuth `state` is AES-GCM sealed (encrypted + authenticated), not just signed, and bound to a nonce cookie | HMAC-signed state | PKCE verifier must not be readable in URLs/history; nonce cookie prevents login CSRF. |
| 8 | Access-token cache is per-isolate memory only; `/api/token?force=1` bypasses it after a Google 401 | D1 cache | "Never store anything else" in D1; force path lets revoked grants surface as `reconnect_required`. |
| 9 | "Delete notes" in the unarchive-category dialog moves notes to Recently deleted | Hard delete | Trash model gives 30 days to recover. |
| 10 | Note has `editedAt` (content edits, shown/sorted) and `updatedAt` (any change, LWW) | Single field | Legacy: pinning must not change "updated", but sync needs every change stamped. |
| 11 | Plain right-click on a link opens the link menu; table row/column menu needs Ctrl/Shift+right-click; everything else keeps the native spell-check menu | Always intercept | REBUILD.md spellcheck rule. |
| 12 | Accent is also cached in localStorage (`notes-accent`) next to theme + font | Only theme + font | Accent is part of the theme; prevents a colour flash on load. |
