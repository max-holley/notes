import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { brandPlugin } from './vite.brand-plugin.ts';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [brandPlugin()],
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,mjs}'],
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              bindings: { MOCK_GOOGLE: '1', TEST_MIGRATIONS: await readD1Migrations('./migrations') },
            },
          })),
        ],
        test: { name: 'worker', include: ['worker/**/*.test.ts'], setupFiles: ['worker/test/setup.ts'] },
      },
    ],
  },
});
