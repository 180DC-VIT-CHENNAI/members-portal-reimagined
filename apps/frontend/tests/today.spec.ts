import { test, expect } from '@playwright/test';
const empty = () => ({ success: true, generatedAt: '2026-10-08T12:00:00Z', tasks: [], meetings: [], hasMoreTasks: false, hasMoreMeetings: false, attention: { incomingTransfers: 0 } });
const work = () => ({ ...empty(), tasks: [{ id: 'task-1', project_id: 'project-1', title: 'Prepare recommendation', project_name: 'Synthetic project', project_deadline: '2026-10-09T12:00:00Z', due_date: '2026-10-12', priority: 'high' }], meetings: [{ id: 'meet-1', type: 'club', title: 'Synthetic meeting', scheduled_at: '2026-10-09T12:00:00Z', meet_link: 'https://meet.example.invalid/join' }], attention: { incomingTransfers: 1, accountRequests: 2 } });
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' || url.pathname.startsWith('/api/')) return route.abort();
    return route.continue();
  });
});
test('complete an assigned task and navigate attention shortcuts', async ({ page }) => {
  let completed = false;
  await page.route('**/api/work-queue', route => route.fulfill({ json: completed ? empty() : work() }));
  await page.route('**/api/projects/project-1/tasks/task-1', async route => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().postDataJSON()).toEqual({ status: 'completed' });
    expect(route.request().headers().authorization).toBe('Bearer synthetic-browser-a');
    completed = true; await route.fulfill({ json: { success: true } });
  });
  await page.goto('/tests/fixtures/today.html');
  await expect(page.getByText('Prepare recommendation', { exact: true })).toBeVisible();
  await expect(page.getByText(/Project due/)).toBeVisible();
  await expect(page.getByText('· Task due 2026-10-12', { exact: true })).toBeVisible();
  await expect(page.getByText('· high priority', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '1 role invitation(s)' }).click();
  await expect(page.getByText('Opened transfers')).toBeVisible();
  await page.getByRole('button', { name: '2 account request(s)' }).click();
  await expect(page.getByText('Opened admin')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join meeting' })).toHaveAttribute('rel', 'noopener noreferrer');
  await page.getByRole('button', { name: 'Complete Prepare recommendation' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('No open assigned tasks in your current projects.')).toBeVisible();
});
test('server errors remain visible and refresh recovers', async ({ page }) => {
  let count = 0;
  await page.route('**/api/work-queue', route => ++count === 1 ? route.fulfill({ status: 503, json: { error: 'Synthetic service unavailable' } }) : route.fulfill({ json: empty() }));
  await page.goto('/tests/fixtures/today.html');
  await expect(page.getByRole('alert')).toHaveText('Synthetic service unavailable');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('No open assigned tasks in your current projects.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('No upcoming meetings for your current access.')).toBeVisible();
});
test('denied completion keeps work visible and allows retry', async ({ page }) => {
  await page.route('**/api/work-queue', route => route.fulfill({ json: work() }));
  await page.route('**/api/projects/project-1/tasks/task-1', route => route.fulfill({ status: 403, json: { error: 'Synthetic access changed' } }));
  await page.goto('/tests/fixtures/today.html');
  await page.getByRole('button', { name: 'Complete Prepare recommendation' }).click();
  await expect(page.getByRole('alert')).toHaveText('Synthetic access changed');
  await expect(page.getByRole('button', { name: 'Complete Prepare recommendation' })).toBeEnabled();
});
test('switching accounts discards the previous response', async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let oldStarted: () => void = () => {};
  const started = new Promise<void>(resolve => { oldStarted = resolve; });
  await page.route('**/api/work-queue', async route => {
    if (route.request().headers().authorization === 'Bearer synthetic-browser-a') {
      oldStarted(); await held; await route.fulfill({ json: work() }).catch(() => {});
    } else await route.fulfill({ json: empty() });
  });
  await page.goto('/tests/fixtures/today.html'); await started;
  await expect(page.getByText('Loading your work…')).toBeVisible();
  await page.getByRole('button', { name: 'Switch synthetic account' }).click();
  await expect(page.getByText('No open assigned tasks in your current projects.')).toBeVisible();
  release();
  await expect(page.getByText('Prepare recommendation', { exact: true })).toHaveCount(0);
});
test('long content wraps at mobile widths and unsafe meeting links stay inert', async ({ page }, testInfo) => {
  const queue = work(); queue.tasks[0].title = 'Recommendation'.repeat(30); queue.meetings[0].meet_link = 'javascript:alert(1)';
  await page.route('**/api/work-queue', route => route.fulfill({ json: queue }));
  await page.goto('/tests/fixtures/today.html');
  await expect(page.getByRole('heading', { name: 'My open tasks' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join meeting' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await testInfo.attach('today', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});
