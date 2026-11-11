# Decisions log

| # | Decision | Alternatives | Why |
|---|---|---|---|
| 1 | TypeScript 5.9 (not 7.x) | TS 7 native | typescript-eslint peer range is `<6.1`. |
| 2 | Vitest 4.1 + `@cloudflare/vitest-pool-workers` 0.23 | Vitest 5 + renamed `@cloudflare/vitest-plugin` | REBUILD.md names pool-workers; it requires vitest ^4.1. |
| 3 | Mock Google runs inside the Worker under `/__mock/*`, gated by `MOCK_GOOGLE=1` | Separate Node mock server | Same-origin, no extra process, CSP stays `'self'` in mock mode; worker calls mock OAuth in-process (no self-fetch). |
| 4 | Registry lists pure-data manifests; UI modules found by `import.meta.glob('./*/index.tsx')` | Registry imports full modules | Worker must derive scope allow-list + CSP from the registry without bundling React. Adding a service is still "its folder + one registry line". |
| 5 | Legacy has no sort toggle / stats beyond word count; implemented REBUILD.md's versions (sort created/updated persisted in prefs; stats = words/chars + note counts) | — | REBUILD.md asks for them. |
| 6 | "Panels" in legacy are called "Sections" everywhere in new UI ("Insert Section") | — | REBUILD.md wording. |
