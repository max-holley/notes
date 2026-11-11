import base from './playwright.config.ts';
import { defineConfig } from '@playwright/test';

/** `pnpm screenshots`: consistency review captures (not part of `pnpm e2e`). */
export default defineConfig({ ...base, testDir: './e2e/screens', testIgnore: [], workers: 2, timeout: 180_000 });
