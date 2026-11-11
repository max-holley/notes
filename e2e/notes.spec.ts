import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { collectErrors, driveDoc, editor, newNote, signIn, syncNow, tb, waitSynced } from './helpers.ts';

let errors: string[];
test.beforeEach(({ page }) => {
  errors = collectErrors(page);
});
test.afterEach(() => expect(errors, 'no uncaught browser errors').toEqual([]));

const card = (page: import('@playwright/test').Page, title: string) =>
  page.getByTestId('note-card').filter({ has: page.getByTestId('note-card-title').getByText(title, { exact: true }) });

test('Create category and assign to note', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'New category' }).click();
  await page.getByTestId('category-name').fill('Travel');
  await page.getByTestId('category-save').click();
  await expect(page.getByTestId('category-Travel')).toBeVisible();
  await newNote(page, 'Trip');
  await page.getByTestId('note-category').locator('..').click();
  await page.getByRole('option', { name: 'Travel' }).click();
  await page.getByTestId('category-Travel').click();
  await expect(page.getByTestId('list-title')).toHaveText('Travel');
  await expect(card(page, 'Trip')).toBeVisible();
});

test('Drag a note onto a category', async ({ page }) => {
  await signIn(page);
  await newNote(page, 'Dragged');
  const src = card(page, 'Dragged');
  const dst = page.getByTestId('category-Work');
  const s = (await src.boundingBox())!;
  const d = (await dst.boundingBox())!;
  await page.mouse.move(s.x + 40, s.y + 20);
  await page.mouse.down();
  await page.mouse.move(s.x + 60, s.y + 30, { steps: 5 });
  await page.mouse.move(d.x + 20, d.y + d.height / 2, { steps: 15 });
  await page.mouse.up();
  await dst.click();
  await expect(card(page, 'Dragged')).toBeVisible();
});

test('Add and remove a note tag; tag filter', async ({ page }) => {
  await signIn(page);
  await newNote(page, 'Tagged');
  await page.getByTestId('add-tag').click();
  await page.getByTestId('tag-input').fill('#idea');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('note-tag')).toHaveText('#idea');
  await newNote(page, 'Untagged');
  await page.getByRole('group', { name: 'Filter by tag' }).getByRole('button', { name: '#idea' }).click();
  await expect(card(page, 'Tagged')).toBeVisible();
  await expect(card(page, 'Untagged')).toHaveCount(0);
  await page.getByRole('group', { name: 'Filter by tag' }).getByRole('button', { name: '#idea' }).click();
  await card(page, 'Tagged').click();
  await page.getByTestId('note-tag').locator('svg').click();
  await expect(page.getByTestId('note-tag')).toHaveCount(0);
});

test('Pin and unpin a note', async ({ page }) => {
  await signIn(page);
  await newNote(page, 'Older');
  await newNote(page, 'Newer');
  await card(page, 'Older').hover();
  await card(page, 'Older').getByRole('button', { name: 'Pin' }).click();
  await expect(page.getByTestId('note-card').first()).toContainText('Older');
  await expect(page.locator('.MuiListSubheader-root', { hasText: 'Pinned' })).toBeVisible();
  await card(page, 'Older').getByRole('button', { name: 'Unpin' }).click();
  await expect(page.getByTestId('note-card').first()).toContainText('Newer');
});

test('Search filters notes', async ({ page }) => {
  await signIn(page);
  await newNote(page, 'Apples', 'red fruit');
  await newNote(page, 'Carrots', 'orange vegetable');
  await page.getByTestId('search').fill('fruit');
  await expect(card(page, 'Apples')).toBeVisible();
  await expect(card(page, 'Carrots')).toHaveCount(0);
});

test('Sort toggle created vs updated is persisted', async ({ page }) => {
  await signIn(page);
  await newNote(page, 'First');
  await newNote(page, 'Second');
  await card(page, 'First').click();
  await editor(page).click();
  await page.keyboard.type('edited later');
  await page.waitForTimeout(600);
  await expect(page.getByTestId('note-card').first()).toContainText('First');
  await page.getByTestId('sort-toggle').click();
  await expect(page.getByTestId('sort-toggle')).toHaveText(/Created/);
  await expect(page.getByTestId('note-card').first()).toContainText('Second');
  await syncNow(page);
  await page.reload();
  await waitSynced(page);
  await expect(page.getByTestId('sort-toggle')).toHaveText(/Created/);
});

test('Archive and unarchive a note', async ({ page }) => {
  await signIn(page);
  await newNote(page, 'Old stuff');
  await page.getByTestId('note-more').click();
  await page.getByRole('menuitem', { name: 'Archive note' }).click();
  await expect(card(page, 'Old stuff')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show archived notes' }).click();
  await expect(card(page, 'Old stuff')).toContainText('Archived');
  await card(page, 'Old stuff').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Unarchive note' }).click();
  await page.getByRole('button', { name: 'Hide archived notes' }).click();
  await expect(card(page, 'Old stuff')).toBeVisible();
});

test('Archive category, then unarchive with restore / keep / delete choice', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('category-Work').click();
  await newNote(page, 'Work note');
  await page.getByTestId('category-Work').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Archive category' }).click();
  await expect(page.getByRole('dialog')).toContainText('Archive this category?');
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByTestId('category-Work')).toHaveCount(0);
  await page.getByRole('button', { name: 'Manage categories' }).click();
  await page.getByRole('switch', { name: 'Work active' }).click();
  await expect(page.getByText('Unarchive this category?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore notes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep notes archived' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore notes' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByTestId('category-Work').click();
  await expect(card(page, 'Work note')).toBeVisible();
});

test('Delete confirmation can cancel or delete; Recently deleted restore + delete forever', async ({ page }) => {
  await signIn(page);
  await newNote(page, 'Doomed');
  await page.getByTestId('note-more').click();
  await page.getByTestId('delete-note').click();
  await expect(card(page, 'Doomed')).toHaveCount(0);
  await page.getByTestId('nav-trash').click();
  await expect(page.getByTestId('trash-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Restore Doomed' }).click();
  await expect(page.getByTestId('trash-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'All notes' }).click();
  await card(page, 'Doomed').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete note' }).click();
  await page.getByTestId('nav-trash').click();
  await page.getByRole('button', { name: 'Delete Doomed forever' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('trash-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete Doomed forever' }).click();
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await expect(page.getByTestId('trash-item')).toHaveCount(0);
});

test('Quick note switching saves the previous note; changes survive reload', async ({ page, request }) => {
  const email = await signIn(page);
  await newNote(page, 'Alpha');
  await editor(page).click();
  await page.keyboard.type('alpha body');
  await newNote(page, 'Beta');
  await card(page, 'Alpha').click();
  await expect(editor(page)).toContainText('alpha body');
  await syncNow(page);
  await page.reload();
  await waitSynced(page);
  await card(page, 'Alpha').click();
  await expect(editor(page)).toContainText('alpha body');
  const { doc } = await driveDoc(request, email);
  expect(JSON.stringify(doc)).toContain('alpha body');
});

test('Sidebar sections collapse and stay collapsed (synced prefs)', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('category-Work').click();
  await page.getByRole('button', { name: /^Categories/ }).click();
  await expect(page.getByTestId('category-Work')).toBeHidden();
  await expect(page.getByTestId('categories-active-filter')).toHaveText('Work');
  await syncNow(page);
  await page.reload();
  await waitSynced(page);
  await expect(page.getByTestId('category-Personal')).toBeHidden();
});

test('Export downloads valid note data; import round-trips JSON and Markdown', async ({ page }, info) => {
  await signIn(page);
  await newNote(page, 'Exported');
  await editor(page).click();
  await page.keyboard.type('bold?');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page.getByTestId('open-import-export').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
  const json = JSON.parse(fs.readFileSync((await dl.path())!, 'utf8'));
  expect(json.format).toBe('notes-export');
  expect(json.notes.some((n: { title: string }) => n.title === 'Exported')).toBe(true);
  const md = info.outputPath('Imported note.md');
  fs.writeFileSync(md, '# Imported title\n\n**bold** text\n\n- [x] done\n- [ ] todo\n\n> [!WARNING]\n> careful\n');
  const legacy = info.outputPath('legacy.json');
  fs.writeFileSync(legacy, JSON.stringify({ version: 2, categories: [{ id: 'c1', name: 'Legacy cat', color: '#5b6cff' }], notes: [{ id: 'l1', title: 'Legacy note', body: '<p>old</p>', category: 'c1', tags: ['old'], pinned: false, created: 1, updated: 2 }] }));
  await page.getByTestId('import-input').setInputFiles([md, legacy]);
  await expect(card(page, 'Imported title')).toBeVisible();
  await expect(card(page, 'Legacy note')).toBeVisible();
  await card(page, 'Imported title').click();
  await expect(editor(page).locator('strong')).toHaveText('bold');
  await expect(editor(page).locator('li[data-type="taskItem"]')).toHaveCount(2);
  await expect(editor(page).locator('[data-section="warning"]')).toContainText('careful');
  await expect(page.getByTestId('category-Legacy cat')).toBeVisible();
});

test('Settings opens by click and dismisses; theme and accent', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('radio', { name: 'Green' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
});

test('Font change previews live, Escape reverts, Save persists', async ({ page }) => {
  await signIn(page);
  const font = () => page.evaluate(() => getComputedStyle(document.body).fontFamily);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page.getByTestId('open-font').click();
  await page.getByTestId('font-merriweather').click();
  expect(await font()).toContain('Merriweather');
  await page.keyboard.press('Escape');
  expect(await font()).toContain('Roboto');
  await page.getByTestId('open-font').click();
  await page.getByTestId('font-inter').click();
  await page.getByTestId('font-save').click();
  expect(await font()).toContain('Inter');
  await page.keyboard.press('Escape');
  await syncNow(page);
  await page.reload();
  expect(await font()).toContain('Inter');
  await newNote(page, 'mono');
  await editor(page).click();
  await page.keyboard.type('`code` ');
  expect(await editor(page).locator('code').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Roboto Mono');
});

test('Toolbar customise: hide, reorder, reset; recoverable when all hidden', async ({ page }) => {
  await signIn(page);
  await newNote(page, 'Toolbar');
  const bar = (await page.getByTestId('editor-toolbar').boundingBox())!;
  await page.mouse.click(bar.x + bar.width - 60, bar.y + 4, { button: 'right' });
  await expect(page.getByRole('dialog', { name: 'Customise toolbar' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Show Bold' }).uncheck();
  await page.getByRole('button', { name: 'Move Italic up' }).click();
  await page.getByTestId('toolbar-save').click();
  await expect(page.getByTestId('tb-bold')).toHaveCount(0);
  // Hide everything: the customise button stays.
  await page.getByTestId('tb-customise').click();
  for (const box of await page.getByRole('checkbox', { name: /^Show / }).all()) await box.uncheck();
  await page.getByTestId('toolbar-save').click();
  await expect(page.getByTestId('tb-customise')).toBeVisible();
  await page.getByTestId('tb-customise').click();
  await page.getByTestId('toolbar-reset').click();
  await page.getByTestId('toolbar-save').click();
  await expect(page.getByTestId('tb-bold')).toBeVisible();
  // Keyboard reorder with dnd-kit.
  await page.getByTestId('tb-customise').click();
  await page.getByRole('button', { name: 'Reorder Bold' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await page.getByTestId('toolbar-save').click();
  await expect(page.getByTestId('editor-toolbar').locator('[data-testid^="tb-"]').nth(1)).toHaveAttribute('data-testid', 'tb-bold');
});

test('Offline edit then reconnect', async ({ page, context, request }) => {
  const email = await signIn(page);
  await newNote(page, 'Offline note');
  await syncNow(page);
  await context.setOffline(true);
  await editor(page).click();
  await page.keyboard.type('typed offline');
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'offline', { timeout: 20_000 });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitSynced(page);
  const { doc } = await driveDoc(request, email);
  expect(JSON.stringify(doc)).toContain('typed offline');
});

test('Two tabs: concurrent edits converge (last writer wins per note, no lost notes)', async ({ page, context, request }) => {
  const email = await signIn(page);
  const tab2 = await context.newPage();
  await tab2.goto('/app');
  await waitSynced(tab2);
  await newNote(page, 'Tab one');
  await newNote(tab2, 'Tab two');
  await syncNow(page);
  await syncNow(tab2);
  await expect(card(page, 'Tab two')).toBeVisible();
  await expect(card(tab2, 'Tab one')).toBeVisible();
  const { doc } = await driveDoc(request, email);
  const titles = Object.values(doc.notes as Record<string, { title: string }>).map((n) => n.title);
  expect(titles).toEqual(expect.arrayContaining(['Tab one', 'Tab two']));
});

test('Image insert is compressed and stored as a separate Drive file', async ({ page, request }, info) => {
  const email = await signIn(page);
  await newNote(page, 'Picture');
  const png = info.outputPath('big.png');
  const buf = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 3000;
    c.height = 2000;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `hsl(${i}, 80%, 50%)`;
      g.fillRect(Math.random() * 3000, Math.random() * 2000, 200, 200);
    }
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/png'));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  fs.writeFileSync(png, Buffer.from(buf));
  await editor(page).click();
  await page.getByTestId('image-input').setInputFiles(png);
  await expect(editor(page).locator('img[data-drive-id]')).toHaveCount(1, { timeout: 15_000 });
  const dims = await editor(page).locator('img').evaluate((i: HTMLImageElement) => new Promise<[number, number]>((r) => (i.complete ? r([i.naturalWidth, i.naturalHeight]) : (i.onload = () => r([i.naturalWidth, i.naturalHeight])))));
  expect(Math.max(...dims)).toBeLessThanOrEqual(1600);
  const { files } = await driveDoc(request, email);
  const img = files.find((f) => f.appProperties?.notesApp === 'image')!;
  expect(img.contentType).toMatch(/image\/(webp|jpeg)/);
  expect(Number(img.size)).toBeLessThan(buf.length);
  await tb(page, 'undo');
});
