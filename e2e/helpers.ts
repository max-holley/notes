import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const SCOPES = {
  drive: 'https://www.googleapis.com/auth/drive.file',
  tasks: 'https://www.googleapis.com/auth/tasks',
  calendar: 'https://www.googleapis.com/auth/calendar.events.readonly',
};

export const uniqueEmail = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}@example.com`;

/** Landing → Continue with Google → mock consent → workspace. */
export async function signIn(page: Page, opts: { email?: string; untick?: string[]; path?: string } = {}) {
  const email = opts.email ?? uniqueEmail();
  await page.goto(opts.path ?? '/');
  await page.getByRole('link', { name: 'Continue with Google' }).click();
  await page.waitForURL(/__mock\/oauth\/authorize/);
  await page.fill('input[name=email]', email);
  for (const s of opts.untick ?? []) await page.uncheck(`input[value="${s}"]`);
  await page.click('#allow');
  await page.waitForURL(/\/app/);
  await waitSynced(page);
  return email;
}

export async function waitSynced(page: Page) {
  await expect(page.getByTestId('sync-status').first()).toHaveAttribute('data-status', 'synced', { timeout: 20_000 });
}

/** Flush pending edits to Drive now (Ctrl+S) and wait for "Synced". */
export async function syncNow(page: Page) {
  await page.keyboard.press('Control+s');
  await waitSynced(page);
}

export async function newNote(page: Page, title?: string, body?: string) {
  await page.getByTestId('new-note').first().click();
  const t = page.getByTestId('note-title').locator('textarea').first();
  await expect(t).toBeFocused();
  if (title) await t.fill(title);
  if (body !== undefined) {
    await editor(page).click();
    await page.keyboard.type(body);
  }
  return t;
}

export const editor = (page: Page) => page.locator('.ProseMirror').first();
export const editorHtml = (page: Page) => editor(page).innerHTML();

/** Put the caret into the editor by selecting the text of `selector`'s element at offset. */
export async function setDoc(page: Page, html: string) {
  await editor(page).click();
  await page.evaluate((h) => {
    const el = document.querySelector('.ProseMirror') as HTMLElement & { editor?: { commands: { setContent(h: string): void } } };
    el.editor!.commands.setContent(h);
  }, html);
}

/** Place the caret at the end (or start) of the first element matching `selector` inside the editor. */
export async function caretIn(page: Page, selector: string, at: 'start' | 'end' = 'end') {
  await page.evaluate(
    ({ selector, at }) => {
      const root = document.querySelector('.ProseMirror') as HTMLElement & { editor?: { view: { posAtDOM(n: Node, o: number): number }; commands: { focus(): void; setTextSelection(p: number): void } } };
      const el = root.querySelector(selector)!;
      const ed = root.editor!;
      const pos = ed.view.posAtDOM(el, at === 'start' ? 0 : el.childNodes.length);
      ed.commands.focus();
      ed.commands.setTextSelection(pos);
    },
    { selector, at },
  );
}

export async function control(request: APIRequestContext, path: string, data?: unknown, method: 'post' | 'patch' | 'get' = 'post') {
  const res = await request[method](`/__mock/control/${path}`, data === undefined ? undefined : { data });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** The notes-file.json stored in the mock Drive for a user. */
export async function driveDoc(request: APIRequestContext, email: string) {
  const files = (await (await request.get(`/__mock/control/files?email=${encodeURIComponent(email)}`)).json()) as { name: string; text?: string; trashed: boolean; appProperties: Record<string, string>; contentType: string; size: string; mimeType: string }[];
  const data = files.find((f) => f.appProperties?.notesApp === 'data' && !f.trashed);
  return { files, doc: data?.text ? JSON.parse(data.text) : null };
}

export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
