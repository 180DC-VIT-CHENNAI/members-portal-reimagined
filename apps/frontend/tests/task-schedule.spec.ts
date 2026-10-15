import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' || url.pathname.startsWith('/api/')) return route.abort();
    return route.continue();
  });
});
test('lead edits date and priority and sees the shared saved task', async ({ page }) => {
  let task = { id: 'task-1', title: 'Synthetic task', status: 'pending', due_date: null as string | null, priority: 'normal', assigned_to: 'member-1', assigned_name: 'Synthetic member', can_update: true };
  await page.route('**/api/projects/project-1/tasks', route => route.fulfill({ json: { success: true, data: [task] } }));
  await page.route('**/api/projects/project-1/tasks/task-1/details', route => {
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().headers().authorization).toBe('Bearer synthetic-browser-a');
    expect(route.request().postDataJSON()).toEqual({ dueDate: '2026-10-12', priority: 'urgent', assignedTo: 'member-2', expected: { assignedTo: 'member-1', dueDate: null, priority: 'normal' } });
    task = { ...task, due_date: '2026-10-12', priority: 'urgent', assigned_to: 'member-2', assigned_name: 'Synthetic new owner' };
    return route.fulfill({ json: { success: true } });
  });
  await page.goto('/tests/fixtures/task-schedule.html');
  await page.getByRole('button', { name: 'Edit task details' }).click();
  const form = page.locator('form');
  await form.getByLabel('Task owner').selectOption('member-2');
  await form.getByLabel('Task due date').fill('2026-10-12');
  await form.getByLabel('Priority').selectOption('urgent');
  await form.getByRole('button', { name: 'Save task details' }).click();
  await expect(page.getByText('Priority: urgent · Task due 2026-10-12')).toBeVisible();
  await expect(page.getByText('Assigned to Synthetic new owner')).toBeVisible();
});
test('member has status action but no schedule controls', async ({ page }) => {
  await page.route('**/api/projects/project-1/tasks', route => route.fulfill({ json: { success: true, data: [{ id: 'task-1', title: 'Synthetic task', status: 'pending', can_update: true }] } }));
  await page.goto('/tests/fixtures/task-schedule.html?member');
  await expect(page.getByRole('button', { name: 'Complete Synthetic task' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit task details' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Task' })).toHaveCount(0);
});

test('stale task details remain visible and can be reloaded before a fresh edit', async ({ page }) => {
  let task = { id: 'task-1', title: 'Synthetic task', status: 'pending', due_date: null, priority: 'normal', assigned_to: 'member-1', assigned_name: 'Synthetic member', can_update: true };
  await page.route('**/api/projects/project-1/tasks', route => route.fulfill({ json: { success: true, data: [task] } }));
  await page.route('**/api/projects/project-1/tasks/task-1/details', route => {
    expect(route.request().postDataJSON().expected.assignedTo).toBe('member-1');
    task = { ...task, assigned_to: 'member-2', assigned_name: 'Synthetic new owner' };
    return route.fulfill({ status: 409, json: { error: 'Task changed; refresh and try again' } });
  });
  await page.goto('/tests/fixtures/task-schedule.html');
  await page.getByRole('button', { name: 'Edit task details' }).click();
  await page.locator('form').getByLabel('Priority').selectOption('urgent');
  await page.getByRole('button', { name: 'Save task details' }).click();
  await expect(page.getByRole('alert')).toHaveText('Task changed; refresh and try again');
  await expect(page.locator('form').getByLabel('Priority')).toHaveValue('urgent');
  await page.getByRole('button', { name: 'Reload task' }).click();
  await expect(page.getByText('Assigned to Synthetic new owner')).toBeVisible();
  await page.getByRole('button', { name: 'Edit task details' }).click();
  await expect(page.locator('form').getByLabel('Task owner')).toHaveValue('member-2');
  await expect(page.locator('form').getByLabel('Priority')).toHaveValue('normal');
});

test('delayed task list is discarded after account switching', async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let started: () => void = () => {};
  const pending = new Promise<void>(resolve => { started = resolve; });
  let delivered: () => void = () => {};
  const done = new Promise<void>(resolve => { delivered = resolve; });
  await page.route('**/api/projects/project-1/tasks', async route => {
    if (route.request().headers().authorization === 'Bearer synthetic-browser-a') {
      started(); await held;
      await route.fulfill({ json: { success: true, data: [{ id: 'private-task', title: 'Synthetic old private task', status: 'pending', can_update: true }] } });
      delivered();
    } else await route.fulfill({ json: { success: true, data: [] } });
  });
  await page.goto('/tests/fixtures/task-schedule.html'); await pending;
  await page.getByRole('button', { name: 'Switch synthetic account' }).click();
  await expect(page.getByText('No tasks assigned.', { exact: true })).toBeVisible();
  release(); await done;
  await expect(page.getByText('Synthetic old private task')).toHaveCount(0);
  await expect(page.getByText('No tasks assigned.', { exact: true })).toBeVisible();
});
test('task history displays attribution and loads older changes', async ({ page }) => {
  await page.route('**/api/projects/project-1/tasks', route => route.fulfill({ json: { success: true, data: [{ id: 'task-1', title: 'Synthetic task', status: 'pending', can_update: true }] } }));
  await page.route('**/api/projects/project-1/tasks/task-1/history*', route => {
    expect(route.request().headers().authorization).toBe('Bearer synthetic-browser-a');
    const older = new URL(route.request().url()).searchParams.has('cursor');
    return route.fulfill({ json: { success: true, data: [{ id: older ? 'event-2' : 'event-1', action: 'task_status_changed', createdAt: '2026-10-08 00:00:00', actorName: older ? 'Synthetic older actor' : 'Synthetic actor', from: { status: 'pending' }, to: { status: 'completed' } }], nextCursor: older ? null : 'synthetic-cursor' } });
  });
  await page.goto('/tests/fixtures/task-schedule.html?member');
  await page.getByRole('button', { name: 'Show history for Synthetic task' }).click();
  await expect(page.getByText('Synthetic actor', { exact: true })).toBeVisible();
  await expect(page.getByText('Status: pending → Status: completed')).toBeVisible();
  await page.getByRole('button', { name: 'Load older changes' }).click();
  await expect(page.getByText('Synthetic older actor', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load older changes' })).toHaveCount(0);
});

test('history refresh clears previously displayed events after a non-JSON access denial', async ({ page }) => {
  await page.route('**/api/projects/project-1/tasks', route => route.fulfill({ json: { success: true, data: [{ id: 'task-1', title: 'Synthetic task', status: 'pending', can_update: true }] } }));
  let requests = 0;
  await page.route('**/api/projects/project-1/tasks/task-1/history*', route => ++requests === 1 ? route.fulfill({ json: { success: true, data: [{ id: 'event-1', action: 'task_status_changed', createdAt: '2026-10-08 00:00:00', actorName: 'Synthetic private actor', from: { status: 'pending' }, to: { status: 'completed' } }], nextCursor: null } }) : route.fulfill({ status: 404, contentType: 'text/plain', body: 'not available' }));
  await page.goto('/tests/fixtures/task-schedule.html?member');
  await page.getByRole('button', { name: 'Show history for Synthetic task' }).click();
  await expect(page.getByText('Synthetic private actor', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh history' }).click();
  await expect(page.getByRole('alert')).toHaveText('Could not load task history');
  await expect(page.getByText('Synthetic private actor', { exact: true })).toHaveCount(0);
});
