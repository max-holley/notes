import { test, type Page } from '@playwright/test';
import { newNote, setDoc, signIn, tb } from '../helpers.ts';

/** Captures every screen, dialog and menu in light + dark, compact + expanded, into screenshots/ for the consistency review. */
const SIZES = { expanded: { width: 1440, height: 900 }, compact: { width: 390, height: 844 } } as const;
const RICH = '<h1>Project kickoff</h1><p>Some <strong>bold</strong>, <em>italic</em>, <a href="https://example.com">a link</a> and <code>code</code>.</p><div data-section="info"><p>Info section</p></div><div data-section="warning"><p>Warning section</p></div><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Checklist item</p></li><li data-type="taskItem" data-checked="true"><p>Done item</p></li></ul><blockquote><p>A quote</p></blockquote><table><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>';

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/${name}.png` });
}

for (const scheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`screens ${scheme} ${size}`, async ({ page }) => {
      const tag = `${scheme}-${size}`;
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await shot(page, `${tag}-01-landing`);
      await page.goto('/privacy');
      await shot(page, `${tag}-02-privacy`);
      await signIn(page);
      await shot(page, `${tag}-03-workspace-empty`);
      if (size === 'compact') {
        await page.getByTestId('new-note-fab').click();
      } else {
        await newNote(page);
      }
      await page.getByTestId('note-title').locator('textarea').first().fill('Project kickoff');
      await setDoc(page, RICH);
      await shot(page, `${tag}-04-editor`);
      await tb(page, 'blockStyle');
      await shot(page, `${tag}-05-menu-blockstyle`);
      await page.keyboard.press('Escape');
      if (await page.getByTestId('tb-more').isVisible()) {
        await page.getByTestId('tb-more').click();
        await shot(page, `${tag}-06-menu-toolbar-more`);
        await page.keyboard.press('Escape');
      }
      await page.getByTestId('note-more').click();
      await shot(page, `${tag}-07-menu-note-more`);
      await page.keyboard.press('Escape');
      if (size === 'compact') await page.getByTestId('editor-back').click();
      await page.getByRole('button', { name: 'Account menu' }).click();
      await shot(page, `${tag}-08-menu-account`);
      await page.getByRole('menuitem', { name: 'Settings' }).click();
      await shot(page, `${tag}-09-dialog-settings`);
      await page.getByTestId('open-font').click();
      await shot(page, `${tag}-10-dialog-font`);
      await page.keyboard.press('Escape');
      await page.getByTestId('open-import-export').click();
      await shot(page, `${tag}-11-dialog-import-export`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('menuitem', { name: 'Devices' }).click();
      await shot(page, `${tag}-12-dialog-devices`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('menuitem', { name: /Disconnect/ }).click();
      await shot(page, `${tag}-13-dialog-delete-account`);
      await page.keyboard.press('Escape');
      if (size === 'compact') await page.getByRole('button', { name: 'Open navigation' }).click();
      await shot(page, `${tag}-14-sidebar`);
      await page.getByRole('button', { name: 'Manage categories' }).click();
      await shot(page, `${tag}-15-dialog-categories`);
      await page.keyboard.press('Escape');
      const openNav = async () => {
        if (size === 'compact' && !(await page.getByTestId('nav-drawer').isVisible())) await page.getByRole('button', { name: 'Open navigation' }).click();
      };
      await openNav();
      await page.getByRole('button', { name: 'New category' }).click();
      await shot(page, `${tag}-16-dialog-category`);
      await page.keyboard.press('Escape');
      await openNav();
      await page.getByTestId('new-meeting-note').click();
      await shot(page, `${tag}-17-dialog-meeting-note`);
      for (let i = 0; i < 3 && ((await page.getByRole('dialog').count()) || (await page.getByTestId('nav-drawer').isVisible())); i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
      if (size === 'compact') {
        await page.getByRole('button', { name: 'Tasks' }).click();
      } else await page.getByTestId('nav-tasks').click();
      await shot(page, `${tag}-18-tasks`);
      if (size === 'compact') await page.getByRole('button', { name: 'Deleted' }).click();
      else await page.getByTestId('nav-trash').click();
      await shot(page, `${tag}-19-recently-deleted`);
    });
  }
}

test('medium window class (rail)', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await signIn(page);
  await page.getByTestId('new-note-rail').click();
  await setDoc(page, RICH);
  await shot(page, 'light-medium-01-rail-editor');
});
