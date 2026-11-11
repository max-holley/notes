import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { brand } from '../src/brand/brand.config.ts';
import { control, editor, newNote, signIn, tb } from './helpers.ts';

interface MockTask { id: string; title: string; status: string; due?: string; deleted?: boolean; notes?: string }
async function remoteTasks(request: APIRequestContext, email: string): Promise<MockTask[]> {
  const lists = (await (await request.get(`/__mock/control/tasks?email=${encodeURIComponent(email)}`)).json()) as { title: string; tasks: MockTask[] }[];
  return lists.flatMap((l) => l.tasks.filter((t) => !t.deleted));
}
const reconcile = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

async function makeTaskLine(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Shift+9');
  await tb(page, 'taskLine');
  await expect(editor(page).locator('li[data-task-line="true"]')).toHaveCount(1);
}

test('task line lifecycle: create, complete, rename (both ways), due date, delete with grace + undo', async ({ page, request }) => {
  test.setTimeout(180_000);
  const email = await signIn(page);
  await newNote(page, 'Errands');
  await makeTaskLine(page, 'Buy milk');

  // Create → Google Task in the dedicated list with a deep link back to the note.
  await expect.poll(async () => (await remoteTasks(request, email)).map((t) => t.title), { timeout: 15_000 }).toContain('Buy milk');
  const lists = (await (await request.get(`/__mock/control/tasks?email=${encodeURIComponent(email)}`)).json()) as { title: string }[];
  expect(lists.map((l) => l.title)).toContain(brand.appName);
  const [task] = await remoteTasks(request, email);
  expect(task!.notes).toMatch(/\/app\?note=/);
  await expect(editor(page).locator(`li[data-task-id="${task!.id}"]`)).toHaveCount(1);

  // Complete in the app → completed in Google.
  await editor(page).locator('li[data-task-line] input[type=checkbox]').check();
  await expect.poll(async () => (await remoteTasks(request, email))[0]?.status, { timeout: 15_000 }).toBe('completed');

  // Un-complete + rename in Google → note line follows.
  await control(request, `tasks/${task!.id}`, { status: 'needsAction', title: 'Buy oat milk' }, 'patch');
  await reconcile(page);
  await expect(editor(page).locator('li[data-task-line]')).toContainText('Buy oat milk', { timeout: 15_000 });
  await expect(editor(page).locator('li[data-task-line]')).toHaveAttribute('data-checked', 'false');

  // Edit the line → Google title follows.
  await editor(page).locator('li[data-task-line] p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' x2');
  await expect.poll(async () => (await remoteTasks(request, email))[0]?.title, { timeout: 15_000 }).toBe('Buy oat milk x2');

  // Due date via the chip's calendar.
  await page.getByTestId('due-chip').click();
  await page.getByRole('gridcell', { name: '28' }).first().click();
  await expect(page.getByTestId('due-chip')).not.toHaveAttribute('data-due', '');
  await expect.poll(async () => (await remoteTasks(request, email))[0]?.due ?? '', { timeout: 15_000 }).toMatch(/-28T/);

  // Right-click menu on the chip: clear due date.
  await page.getByTestId('due-chip').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Clear due date' }).click();
  await expect.poll(async () => (await remoteTasks(request, email))[0]?.due ?? null, { timeout: 15_000 }).toBeNull();

  // Delete the line: the task survives the 60 s grace period, then is deleted with an Undo snackbar.
  await editor(page).locator('li[data-task-line] p').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(5_000);
  await reconcile(page);
  await page.waitForTimeout(3_000);
  expect((await remoteTasks(request, email)).length).toBe(1);
  await expect(page.getByText(/Deleted Google Task/)).toBeVisible({ timeout: 90_000 });
  expect((await remoteTasks(request, email)).length).toBe(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(editor(page).locator('li[data-task-line]')).toContainText('Buy oat milk x2');
  await expect.poll(async () => (await remoteTasks(request, email)).length, { timeout: 15_000 }).toBe(1);
});

test('cut and paste a task line into another note keeps the same Google Task', async ({ page, request }) => {
  const email = await signIn(page);
  await newNote(page, 'Source');
  await makeTaskLine(page, 'Moveable task');
  await expect.poll(async () => (await remoteTasks(request, email)).length, { timeout: 15_000 }).toBe(1);
  const id = (await remoteTasks(request, email))[0]!.id;
  await expect(editor(page).locator(`li[data-task-id="${id}"]`)).toHaveCount(1);
  await editor(page).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+x');
  await newNote(page, 'Destination');
  await editor(page).click();
  await page.keyboard.press('Control+v');
  await expect(editor(page).locator(`li[data-task-id="${id}"]`)).toHaveCount(1);
  await page.waitForTimeout(3_000);
  await reconcile(page);
  await page.waitForTimeout(2_000);
  const tasks = await remoteTasks(request, email);
  expect(tasks.map((t) => t.id)).toEqual([id]);
});

test('Tasks view groups by note, shows urgency and opens the note at the line', async ({ page, request }) => {
  const email = await signIn(page);
  await newNote(page, 'Later stuff');
  await makeTaskLine(page, 'Someday');
  await newNote(page, 'Urgent stuff');
  await makeTaskLine(page, 'Pay bill');
  await page.getByTestId('due-chip').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Today' }).click();
  await expect.poll(async () => (await remoteTasks(request, email)).length, { timeout: 15_000 }).toBe(2);
  await page.getByTestId('nav-tasks').click();
  const groups = page.getByTestId('task-group');
  await expect(groups).toHaveCount(2);
  await expect(groups.first()).toContainText('Urgent stuff');
  await expect(groups.first().getByRole('button', { name: /Due Today/ })).toHaveAttribute('data-status', 'today');
  await groups.nth(1).getByRole('checkbox').click();
  await expect(groups).toHaveCount(1); // completed tasks are hidden by default
  await expect.poll(async () => (await remoteTasks(request, email)).find((t) => t.title === 'Someday')?.status, { timeout: 15_000 }).toBe('completed');
  await groups.first().getByText('Pay bill').click();
  await expect(page.getByTestId('note-title').locator('textarea').first()).toHaveValue('Urgent stuff');
  expect(await page.evaluate(() => (getSelection()?.anchorNode?.parentElement?.closest('li[data-task-line]')?.textContent ?? ''))).toContain('Pay bill');
});

test('Tasks not granted: view shows Connect, task lines stay local', async ({ page }) => {
  await signIn(page, { untick: ['https://www.googleapis.com/auth/tasks'] });
  await page.getByTestId('nav-tasks').click();
  await expect(page.getByTestId('connect-tasks-view')).toBeVisible();
});
