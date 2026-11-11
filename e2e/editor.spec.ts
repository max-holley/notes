import { expect, test, type Page } from '@playwright/test';
import { caretIn, collectErrors, editor, editorHtml, newNote, setDoc, signIn, tb } from './helpers.ts';

/** Ported from legacy/tests/editor.cjs (editor behaviour). */
let errors: string[];
test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  await signIn(page);
  await newNote(page, 'Editor test');
});
test.afterEach(() => {
  expect(errors, 'no uncaught browser errors').toEqual([]);
});

const inBlock = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    let n = getSelection()!.anchorNode as Node | null;
    if (n && n.nodeType === 3) n = n.parentElement;
    return !!(n as HTMLElement | null)?.closest(sel);
  }, selector);

test('Create and title a note', async ({ page }) => {
  await expect(page.getByTestId('note-card').first()).toContainText('Editor test');
});

test('Checklist converts each selected paragraph to its own item', async ({ page }) => {
  await setDoc(page, '<p>one</p><p>two</p><p>three</p>');
  await editor(page).click();
  await page.keyboard.press('Control+a');
  await tb(page, 'taskList');
  await expect(editor(page).locator('li[data-type="taskItem"]')).toHaveCount(3);
});

test('Section insertion places caret inside', async ({ page }) => {
  await editor(page).click();
  await tb(page, 'section');
  await page.getByTestId('section-warning').click();
  await page.keyboard.type('inside');
  await expect(editor(page).locator('[data-section="warning"]')).toContainText('inside');
  expect(await inBlock(page, '[data-section]')).toBe(true);
});

test('Enter on empty final section line exits', async ({ page }) => {
  await setDoc(page, '<div data-section="info"><p>hello</p></div>');
  await caretIn(page, '[data-section] p');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('after');
  expect(await inBlock(page, '[data-section]')).toBe(false);
  await expect(editor(page).locator('[data-section]')).toHaveText('hello');
});

test('Virtual keyboard Enter exits a section', async ({ page }) => {
  await setDoc(page, '<div data-section="note"><p>x</p></div>');
  await caretIn(page, '[data-section] p');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  expect(await inBlock(page, '[data-section]')).toBe(false);
});

test('Ctrl+Enter exits a populated section', async ({ page }) => {
  await setDoc(page, '<div data-section="info"><p>one</p><p>two</p></div><p>end</p>');
  await caretIn(page, '[data-section] p');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type('outside');
  expect(await inBlock(page, '[data-section]')).toBe(false);
  await expect(editor(page).locator('[data-section]')).not.toContainText('outside');
});

test('Ctrl+Enter outside a block inserts a divider and continues below', async ({ page }) => {
  await setDoc(page, '<p>top</p>');
  await caretIn(page, 'p');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type('below');
  await expect(editor(page).locator('hr')).toHaveCount(1);
  expect(await editorHtml(page)).toMatch(/<hr[^>]*>.*below/);
});

test('ArrowDown exits last section boundary', async ({ page }) => {
  await setDoc(page, '<div data-section="info"><p>last</p></div>');
  await caretIn(page, '[data-section] p');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('below');
  expect(await inBlock(page, '[data-section]')).toBe(false);
});

test('ArrowUp exits first section boundary', async ({ page }) => {
  await setDoc(page, '<div data-section="info"><p>first</p></div><p>x</p>');
  await caretIn(page, '[data-section] p', 'start');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.type('above');
  expect(await inBlock(page, '[data-section]')).toBe(false);
  expect(await editorHtml(page)).toMatch(/above.*data-section/);
});

test('Backspace unwraps populated section without losing text', async ({ page }) => {
  await setDoc(page, '<div data-section="error"><p>keep me</p><p>and me</p></div>');
  await caretIn(page, '[data-section] p', 'start');
  await page.keyboard.press('Backspace');
  await expect(editor(page).locator('[data-section]')).toHaveCount(0);
  await expect(editor(page)).toContainText('keep me');
  await expect(editor(page)).toContainText('and me');
});

test('Backspace preserves image-only section content', async ({ page }) => {
  await setDoc(page, '<div data-section="info"><p></p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="></div>');
  await caretIn(page, '[data-section] p', 'start');
  await page.keyboard.press('Backspace');
  await expect(editor(page).locator('[data-section]')).toHaveCount(0);
  await expect(editor(page).locator('img')).toHaveCount(1);
});

test('Section icon changes the section type', async ({ page }) => {
  await setDoc(page, '<div data-section="info"><p>x</p></div>');
  await page.getByTestId('section-icon').click();
  await page.getByRole('menuitem', { name: 'Success' }).click();
  await expect(editor(page).locator('[data-section="success"]')).toHaveCount(1);
});

test('Quote exit', async ({ page }) => {
  await setDoc(page, '<blockquote><p>quoted</p></blockquote>');
  await caretIn(page, 'blockquote p');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('plain');
  expect(await inBlock(page, 'blockquote')).toBe(false);
});

test('Heading Enter returns to body style', async ({ page }) => {
  await setDoc(page, '<h2>Heading</h2>');
  await caretIn(page, 'h2');
  await page.keyboard.press('Enter');
  await page.keyboard.type('body');
  expect(await inBlock(page, 'p')).toBe(true);
  expect(await inBlock(page, 'h2')).toBe(false);
});

test('Ctrl+Alt+0-4 block styles', async ({ page }) => {
  await setDoc(page, '<p>text</p>');
  await caretIn(page, 'p');
  await page.keyboard.press('Control+Alt+1');
  await expect(editor(page).locator('h1')).toHaveText('text');
  await page.keyboard.press('Control+Alt+3');
  await expect(editor(page).locator('h3')).toHaveText('text');
  await page.keyboard.press('Control+Alt+0');
  await expect(editor(page).locator('p').first()).toHaveText('text');
  await page.keyboard.press('Control+Alt+4');
  await expect(editor(page).locator('blockquote')).toContainText('text');
});

test('Ctrl+Shift+7/8/9 lists', async ({ page }) => {
  await setDoc(page, '<p>item</p>');
  await caretIn(page, 'p');
  await page.keyboard.press('Control+Shift+8');
  await expect(editor(page).locator('ul:not([data-type]) li')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+7');
  await expect(editor(page).locator('ol li')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+9');
  await expect(editor(page).locator('li[data-type="taskItem"]')).toHaveCount(1);
});

test('Checklist splits text at the caret', async ({ page }) => {
  await setDoc(page, '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>helloworld</p></li></ul>');
  await page.evaluate(() => {
    const root = document.querySelector('.ProseMirror') as HTMLElement & { editor: { view: { posAtDOM(n: Node, o: number): number }; commands: { focus(): void; setTextSelection(p: number): void } } };
    const t = root.querySelector('li p')!.firstChild!;
    root.editor.commands.focus();
    root.editor.commands.setTextSelection(root.editor.view.posAtDOM(t, 5));
  });
  await page.keyboard.press('Enter');
  const items = editor(page).locator('li[data-type="taskItem"]');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveText('hello');
  await expect(items.nth(1)).toHaveText('world');
});

test('Empty checklist item exits, preserving following items', async ({ page }) => {
  await setDoc(page, '<ul data-type="taskList"><li data-type="taskItem"><p>a</p></li><li data-type="taskItem"><p></p></li><li data-type="taskItem"><p>c</p></li></ul>');
  await caretIn(page, 'li:nth-child(2) p');
  await page.keyboard.press('Enter');
  await page.keyboard.type('para');
  expect(await inBlock(page, 'li')).toBe(false);
  await expect(editor(page).locator('li[data-type="taskItem"]')).toHaveCount(2);
  await expect(editor(page)).toContainText('c');
});

test('Checklist Backspace converts item to paragraph', async ({ page }) => {
  await setDoc(page, '<ul data-type="taskList"><li data-type="taskItem"><p>item</p></li></ul>');
  await caretIn(page, 'li p', 'start');
  await page.keyboard.press('Backspace');
  await expect(editor(page).locator('li')).toHaveCount(0);
  await expect(editor(page).locator('p').first()).toHaveText('item');
});

test('Empty bullet exits a regular list', async ({ page }) => {
  await setDoc(page, '<ul><li><p>a</p></li></ul>');
  await caretIn(page, 'li p');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('out');
  expect(await inBlock(page, 'li')).toBe(false);
});

test('Undo and redo custom checklist edits', async ({ page }) => {
  await setDoc(page, '<p>task</p>');
  await caretIn(page, 'p');
  await page.keyboard.press('Control+Shift+9');
  await expect(editor(page).locator('li[data-type="taskItem"]')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(editor(page).locator('li[data-type="taskItem"]')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor(page).locator('li[data-type="taskItem"]')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  await expect(editor(page).locator('li[data-type="taskItem"]')).toHaveCount(1);
});

test('Undo section removal restores content and structure', async ({ page }) => {
  await setDoc(page, '<div data-section="info"><p>content</p></div>');
  await page.waitForTimeout(700); // separate history group from setContent
  await caretIn(page, '[data-section] p', 'start');
  await page.keyboard.press('Backspace');
  await expect(editor(page).locator('[data-section]')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(editor(page).locator('[data-section]')).toContainText('content');
});

test('Undo and redo ordinary typing', async ({ page }) => {
  await editor(page).click();
  await page.keyboard.type('typed text');
  await page.waitForTimeout(600);
  await page.keyboard.press('Control+z');
  await expect(editor(page)).not.toContainText('typed text');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor(page)).toContainText('typed text');
});

test('Table Tab navigates cells and adds a final row', async ({ page }) => {
  await setDoc(page, '<table><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>');
  await caretIn(page, 'th p');
  await page.keyboard.press('Tab');
  await page.keyboard.type('x');
  await expect(editor(page).locator('th').nth(1)).toContainText('x');
  await caretIn(page, 'tr:last-child td:last-child p');
  await page.keyboard.press('Tab');
  await expect(editor(page).locator('tr')).toHaveCount(3);
});

test('Table Shift+Tab exits before first cell', async ({ page }) => {
  await setDoc(page, '<table><tr><th><p>A</p></th><th><p>B</p></th></tr></table>');
  await caretIn(page, 'th p', 'start');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('before');
  expect(await inBlock(page, 'table')).toBe(false);
  expect(await editorHtml(page)).toMatch(/before.*<table/);
});

test('Ctrl+Enter exits table', async ({ page }) => {
  await setDoc(page, '<table><tr><td><p>A</p></td></tr></table>');
  await caretIn(page, 'td p');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type('after');
  expect(await inBlock(page, 'table')).toBe(false);
});

test('Inline code ArrowRight exits code', async ({ page }) => {
  await setDoc(page, '<p>a <code>code</code></p>');
  await caretIn(page, 'code');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('Z');
  await expect(editor(page).locator('code')).toHaveText('code');
  await expect(editor(page).locator('p').first()).toContainText('codeZ');
});

test('Bold formatting retains selection', async ({ page }) => {
  await setDoc(page, '<p>make bold</p>');
  await editor(page).locator('p').first().selectText();
  await tb(page, 'bold');
  await expect(editor(page).locator('strong')).toHaveCount(1);
  const sel = await page.evaluate(() => getSelection()!.toString());
  expect(sel.length).toBeGreaterThan(0);
});

test('Italic, underline, strikethrough and alignment', async ({ page }) => {
  await setDoc(page, '<p>styled</p>');
  await editor(page).locator('p').first().selectText();
  await page.keyboard.press('Control+i');
  await page.keyboard.press('Control+u');
  await tb(page, 'strike');
  await expect(editor(page).locator('em')).toHaveCount(1);
  await expect(editor(page).locator('u')).toHaveCount(1);
  await expect(editor(page).locator('s')).toHaveCount(1);
  await tb(page, 'align');
  await page.getByTestId('align-center').click();
  await expect(editor(page).locator('p[style*="text-align: center"]')).toHaveCount(1);
});

test('Link creation retains selected text', async ({ page }) => {
  await setDoc(page, '<p>visit site</p>');
  await editor(page).locator('p').first().selectText();
  await page.keyboard.press('Control+k');
  await page.getByTestId('link-input').fill('example.com');
  await page.keyboard.press('Enter');
  const a = editor(page).locator('a');
  await expect(a).toHaveAttribute('href', 'https://example.com');
  await expect(a).toHaveText(/site|visit/);
});

test('Link right-click menu and chip', async ({ page }) => {
  await setDoc(page, '<p><a href="https://example.com">link</a> text</p>');
  await editor(page).locator('a').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open in new tab' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Remove link' }).click();
  await expect(editor(page).locator('a')).toHaveCount(0);
});

test('Spellcheck: right-click on plain text keeps the native menu', async ({ page }) => {
  await setDoc(page, '<p>misspeled word</p>');
  const prevented = await page.evaluate(() => {
    const p = document.querySelector('.ProseMirror p')!;
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    p.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await expect(editor(page)).toHaveAttribute('spellcheck', 'true');
});

test('Image insertion keeps the document editable', async ({ page }) => {
  await setDoc(page, '<p>before</p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="><p>after</p>');
  await caretIn(page, 'p:last-child');
  await page.keyboard.type(' still editable');
  await expect(editor(page)).toContainText('after still editable');
});

test('Table insertion and context row action', async ({ page }) => {
  await editor(page).click();
  await tb(page, 'table');
  await page.getByTestId('grid-3x2').click();
  await expect(editor(page).locator('tr')).toHaveCount(2);
  await expect(editor(page).locator('tr').first().locator('th')).toHaveCount(3);
  await editor(page).locator('td').first().click({ modifiers: ['Shift'], button: 'right' });
  await page.getByRole('menuitem', { name: 'Insert row below' }).click();
  await expect(editor(page).locator('tr')).toHaveCount(3);
});

test('Escape closes dropdown', async ({ page }) => {
  await editor(page).click();
  await tb(page, 'blockStyle');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('Clear formatting', async ({ page }) => {
  await setDoc(page, '<h2><strong>Bold heading</strong></h2>');
  await editor(page).locator('h2').click();
  await page.keyboard.press('Control+a');
  await tb(page, 'clearFormatting');
  await expect(editor(page).locator('strong')).toHaveCount(0);
  await expect(editor(page).locator('h2')).toHaveCount(0);
});
