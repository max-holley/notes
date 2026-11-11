import { expect, test } from '@playwright/test';
import { control, editor, signIn, SCOPES } from './helpers.ts';

test('Today panel lists events and creates a pre-filled meeting note', async ({ page }) => {
  await signIn(page);
  const panel = page.getByTestId('today-panel');
  await expect(panel.getByTestId('calendar-event')).toHaveCount(3);
  await panel.getByRole('button', { name: 'Create meeting note for Project review' }).click();
  await expect(page.getByTestId('note-title').locator('textarea').first()).toHaveValue('Project review');
  const details = editor(page).locator('[data-role="meeting-details"]');
  await expect(details).toContainText('Sam Lee');
  await expect(details).toContainText('Kim Park');
  await expect(details.locator('a[href^="https://meet.google.com/"]')).toHaveCount(1);
  await expect(editor(page).locator('h2')).toHaveText(['Agenda', 'Actions', 'Decisions']);
  await expect(editor(page).locator('li[data-task-line="true"]')).toHaveCount(1);
  // Second click opens the same note rather than duplicating it.
  await panel.getByRole('button', { name: 'Create meeting note for Project review' }).click();
  await expect(page.getByTestId('note-card').filter({ hasText: 'Project review' })).toHaveCount(1);
});

test('Meeting note from the date picker / next 7 days, then Refresh details', async ({ page, request }) => {
  const email = await signIn(page);
  await page.getByTestId('new-meeting-note').click();
  const dialog = page.getByRole('dialog', { name: 'New meeting note' });
  await expect(dialog.getByTestId('upcoming-event').first()).toBeVisible();
  await dialog.getByTestId('upcoming-event').first().click();
  await expect(page.getByTestId('note-title').locator('textarea').first()).toHaveValue('Team stand-up');
  const t = new Date(Date.now() + 86400000);
  const id = `evt${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}${String(t.getUTCDate()).padStart(2, '0')}1`;
  const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 9, 30)).toISOString();
  await control(request, 'events', {
    email,
    event: { id, summary: 'Team stand-up', start: { dateTime: start }, end: { dateTime: start }, attendees: [{ email: 'new@example.com', displayName: 'New Person' }], htmlLink: 'https://calendar.google.com', updated: start },
  });
  await page.getByTestId('note-more').click();
  await page.getByTestId('refresh-details').click();
  await expect(editor(page).locator('[data-role="meeting-details"]')).toContainText('New Person');
  await expect(editor(page).locator('[data-role="meeting-details"]')).not.toContainText('Sam Lee');
  await expect(editor(page).locator('h2')).toHaveCount(3);
});

test('Calendar not granted: Today panel offers Connect; rest of app works', async ({ page }) => {
  await signIn(page, { untick: [SCOPES.calendar] });
  await expect(page.getByTestId('connect-calendar-panel')).toBeVisible();
  await expect(page.getByTestId('today-panel')).toHaveCount(0);
  // Incremental connect goes to the consent screen with only the calendar scope added.
  await page.getByTestId('connect-calendar-panel').click();
  await page.waitForURL(/__mock\/oauth\/authorize/);
  expect(new URL(page.url()).searchParams.get('scope')).toContain(SCOPES.calendar);
  expect(new URL(page.url()).searchParams.get('include_granted_scopes')).toBe('true');
});
