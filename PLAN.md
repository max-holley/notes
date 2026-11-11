# Rebuild plan

Source of truth: `REBUILD.md`. Legacy behaviour summary: `docs/LEGACY_SPEC.md`.

## Architecture
- **Single package** (pnpm). Vite + React 19 + MUI v7 frontend in `src/`, Hono Cloudflare Worker in `worker/`, D1 migrations in `migrations/`.
- Worker runs first for every request (`assets.run_worker_first`): `/api/*` → Hono API, `/__mock/*` → fake Google (only when `MOCK_GOOGLE=1`), everything else → static assets with security headers + CSP derived from the service registry.
- **Service registry** `src/services/registry.ts` lists pure-data manifests (id, label, scopes, API origins). Client UI modules live in `src/services/<id>/index.tsx` and are discovered by `import.meta.glob`. Worker imports only the manifests (no React), so scope allow-list and CSP come from the same file.
- **Mock Google** (`worker/mock/`): fake OAuth consent page (per-scope checkboxes), token endpoint, Drive v3 / Tasks v1 / Calendar v3 subsets, plus `/__mock/control/*` for tests. In-memory state inside the worker isolate. Browser API base URL comes from `/api/config` (`https://www.googleapis.com` real, `/__mock/googleapis` mock).
- **Sync**: pure merge (`src/sync/merge.ts`), engine (`src/sync/engine.ts`) with injected clock/transport for unit tests, IndexedDB outbox (`src/sync/outbox.ts`).
- **Editor**: Tiptap 3 with custom extensions (Section, TaskLine attrs on taskItem, keyboard behaviours).

## Phases
See REBUILD.md §Phases (1-9). Progress tracked in `PROGRESS.md`; choices in `DECISIONS.md`.

## Test strategy
- Vitest projects: `unit` (jsdom/node, src + scripts) and `worker` (`@cloudflare/vitest-pool-workers`, D1 with migrations).
- Playwright e2e against `wrangler dev` with `MOCK_GOOGLE=1` on port 8787, after `vite build`.
