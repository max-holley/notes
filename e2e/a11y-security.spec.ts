import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { newNote, signIn } from './helpers.ts';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function axe(page: Page, label: string) {
  await page.waitForTimeout(350); // let MUI transitions finish
  const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const summary = r.violations.map((v) => `${label}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

async function openAccount(page: Page, item: string) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.describe('accessibility (axe, WCAG 2.2 AA)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`landing and privacy (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
      await axe(page, `landing ${scheme}`);
      await page.goto('/privacy');
      await axe(page, `privacy ${scheme}`);
    });

    test(`workspace and every dialog (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await signIn(page);
      await newNote(page, 'A11y note', 'Some text');
      await axe(page, 'workspace with editor');

      const dialogs: [string, () => Promise<void>][] = [
        ['settings', () => openAccount(page, 'Settings')],
        ['font', async () => { await openAccount(page, 'Settings'); await page.getByTestId('open-font').click(); }],
        ['toolbar customise', () => page.getByTestId('tb-customise').click()],
        ['import/export', async () => { await openAccount(page, 'Settings'); await page.getByTestId('open-import-export').click(); }],
        ['devices', () => openAccount(page, 'Devices')],
        ['delete account', () => openAccount(page, 'Disconnect & delete data')],
        ['new category', () => page.getByRole('button', { name: 'New category' }).click()],
        ['categories manager', () => page.getByRole('button', { name: 'Manage categories' }).click()],
        ['tag manager', () => page.getByRole('button', { name: 'Manage tags' }).click()],
        ['note tags', () => page.getByTestId('add-tag').click()],
        ['stats', () => page.getByTestId('stats-link').click()],
        ['meeting note', () => page.getByTestId('new-meeting-note').click()],
        ['confirm (delete category)', async () => {
          await page.getByTestId('category-Ideas').click({ button: 'right' });
          await page.getByRole('menuitem', { name: 'Delete category' }).click();
        }],
      ];
      for (const [name, open] of dialogs) {
        await open();
        await expect(page.getByRole('dialog').last()).toBeVisible();
        await axe(page, `dialog: ${name}`);
        // Sub-dialogs (font) return to Settings on Escape, so close until none are left.
        for (let i = 0; i < 3 && (await page.getByRole('dialog').count()); i++) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
      await page.getByTestId('nav-tasks').click();
      await axe(page, 'tasks view');
      await page.getByTestId('nav-trash').click();
      await axe(page, 'recently deleted');
    });
  }

  test('compact window class (phone) workspace', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await expect(page.locator('[data-window-class="compact"]')).toBeVisible();
    await axe(page, 'compact list');
    await page.getByTestId('new-note-fab').click();
    await axe(page, 'compact editor');
  });
});

test.describe('keyboard', () => {
  test('main flows are reachable by keyboard; Escape closes menus', async ({ page }) => {
    await signIn(page);
    await page.keyboard.press('Control+n');
    await expect(page.getByTestId('note-title').locator('textarea').first()).toBeFocused();
    await page.keyboard.type('Keyboard only');
    await page.keyboard.press('Enter');
    await expect(page.locator('.ProseMirror')).toBeFocused();
    await page.getByRole('button', { name: 'Account menu' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});

test.describe('security', () => {
  test('strict CSP and security headers on the app shell', async ({ request }) => {
    const res = await request.get('/app');
    const csp = res.headers()['content-security-policy']!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toMatch(/connect-src 'self' https:\/\/www\.googleapis\.com https:\/\/tasks\.googleapis\.com(;|$)/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['referrer-policy']).toBeTruthy();
  });

  test('no inline scripts or third-party resources; tokens never in web storage', async ({ page }) => {
    const hosts = new Set<string>();
    page.on('request', (r) => hosts.add(new URL(r.url()).host));
    await signIn(page);
    await newNote(page, 'Storage check', 'body');
    await page.keyboard.press('Control+s');
    expect([...hosts].filter((h) => h !== 'localhost:8787')).toEqual([]);
    expect(await page.locator('script:not([src])').count()).toBe(0);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toMatch(/mock-at-|mock-rt-|access_token|refresh/i);
    const cookies = await page.context().cookies();
    const sid = cookies.find((c) => c.name === 'sid')!;
    expect(sid.httpOnly).toBe(true);
    expect(sid.sameSite).toBe('Lax');
  });

  test('state-changing API calls without the CSRF header are rejected', async ({ page }) => {
    await signIn(page);
    const status = await page.evaluate(async () => (await fetch('/api/auth/logout', { method: 'POST' })).status);
    expect(status).toBe(403);
  });

  test('data isolation: another user cannot see notes', async ({ browser }) => {
    const a = await (await browser.newContext()).newPage();
    await signIn(a);
    await newNote(a, 'Private to A');
    await a.keyboard.press('Control+s');
    const b = await (await browser.newContext()).newPage();
    await signIn(b);
    await expect(b.getByTestId('note-card').filter({ hasText: 'Private to A' })).toHaveCount(0);
  });
});
