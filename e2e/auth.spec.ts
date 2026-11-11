import { expect, test } from '@playwright/test';
import { brand } from '../src/brand/brand.config.ts';
import { collectErrors, control, driveDoc, newNote, SCOPES, signIn, syncNow, uniqueEmail, waitSynced } from './helpers.ts';

test('landing → sign in → app', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle(brand.appName);
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByText('What our server stores')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy');
  await signIn(page);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId('notes-list')).toBeVisible();
  // First run seeds the default categories.
  await expect(page.getByTestId('category-Personal')).toBeVisible();
  expect(errors).toEqual([]);
});

test('deep link survives sign-in', async ({ page }) => {
  const email = uniqueEmail();
  await signIn(page, { email });
  await newNote(page, 'Deep linked');
  const id = await page.getByTestId('note-editor').getAttribute('data-note-id');
  await syncNow(page);
  await page.context().clearCookies();
  await page.goto(`/app?note=${id}`);
  await page.getByRole('link', { name: 'Continue with Google' }).click();
  await page.fill('input[name=email]', email);
  await page.click('#allow');
  await page.waitForURL(new RegExp(`/app\\?note=${id}`));
  await expect(page.getByTestId('note-title').locator('textarea').first()).toHaveValue('Deep linked');
});

test('second device sees the same data', async ({ browser }) => {
  const email = uniqueEmail();
  const a = await (await browser.newContext()).newPage();
  await signIn(a, { email });
  await newNote(a, 'From device A', 'Shared body');
  await syncNow(a);
  const b = await (await browser.newContext()).newPage();
  await signIn(b, { email });
  await expect(b.getByTestId('note-card').filter({ hasText: 'From device A' })).toBeVisible();
  // Device list shows both sessions; revoke B from A.
  await a.getByRole('button', { name: 'Account menu' }).click();
  await a.getByRole('menuitem', { name: 'Devices' }).click();
  await expect(a.getByTestId('device-row')).toHaveCount(2);
  await a.getByTestId('device-row').filter({ hasNotText: 'this device' }).getByRole('button', { name: 'Revoke' }).click();
  await expect(a.getByTestId('device-row')).toHaveCount(1);
  await b.reload();
  await expect(b.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
});

test('sign out wipes local data', async ({ page }) => {
  await signIn(page);
  await newNote(page, 'Local copy');
  await syncNow(page);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL((u) => u.pathname === '/');
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
  const left = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => { const q = indexedDB.open('notes-local'); q.onsuccess = () => r(q.result); });
    const count = (s: string) => new Promise<number>((r) => { const q = db.transaction(s).objectStore(s).count(); q.onsuccess = () => r(q.result); });
    return { outbox: await count('outbox'), working: await count('working'), keys: Object.keys(localStorage) };
  });
  expect(left.outbox).toBe(0);
  expect(left.working).toBe(0);
  expect(left.keys.every((k) => !/token|note/i.test(k) || k === 'notes-font' || k === 'notes-accent' || k === 'notes-signed-in-before')).toBe(true);
});

test('granular consent: calendar and tasks denied', async ({ page }) => {
  await signIn(page, { untick: [SCOPES.calendar, SCOPES.tasks] });
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page.getByTestId('connect-calendar')).toBeVisible();
  await expect(page.getByTestId('connect-tasks')).toBeVisible();
  await page.keyboard.press('Escape');
  // Notes still work.
  await newNote(page, 'Works without Tasks');
  await syncNow(page);
});

test('revoked Google grant shows a non-blocking reconnect prompt; edits stay queued', async ({ page, request }) => {
  const email = await signIn(page);
  await newNote(page, 'Before revoke');
  await syncNow(page);
  await control(request, 'revoke', { email });
  await control(request, 'expire-access-tokens');
  // Force the server to refresh (its token cache is bypassed by the reconnect flow).
  await page.getByTestId('note-title').locator('textarea').first().fill('Queued while revoked');
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('reconnect')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('note-card').filter({ hasText: 'Queued while revoked' })).toBeVisible();
  await page.getByTestId('reconnect').click();
  await page.fill('input[name=email]', email);
  await page.click('#allow');
  await page.waitForURL(/\/app/);
  await waitSynced(page);
  const { doc } = await driveDoc(request, email);
  expect(Object.values(doc.notes as Record<string, { title: string }>).map((n) => n.title)).toContain('Queued while revoked');
});

test('disconnect & delete data', async ({ page, request }) => {
  const email = await signIn(page);
  await newNote(page, 'To be trashed');
  await syncNow(page);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: /Disconnect/ }).click();
  await page.getByLabel('Also move the Notes folder').check();
  await expect(page.getByTestId('delete-confirm')).toBeDisabled();
  await page.getByTestId('delete-confirm-input').fill('DELETE');
  await page.getByTestId('delete-confirm').click();
  await page.waitForURL((u) => u.pathname === '/');
  const { files } = await driveDoc(request, email);
  expect(files.find((f) => f.appProperties?.notesApp === 'root')?.trashed).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => !k.startsWith('mui-')))).toEqual([]);
});
