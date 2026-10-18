import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
// 23:30 UTC, so "today" and "tomorrow" are UTC dates even late in the day.
const NOW = Date.parse('2030-01-15T23:30:00Z');
const TODAY = '2030-01-15';
const TOMORROW = '2030-01-16';
let portal;
let admin;
let director; // finance director, manages tasks
let member; // finance member
let colleague; // finance member
let outsider; // marketing member
const ids = {};
let project;

async function invite(key, email, departmentId, accessRoleId) {
  const res = await admin.post('/api/people', { email, fullName: key, departmentId, ...(accessRoleId ? { accessRoleId } : {}) });
  assert.equal(res.status, 201, res.text);
  ids[key] = res.json.id;
}

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, ADMIN);
  await invite('director', 'n.dir@example.com', 'finance', 'director');
  await invite('member', 'n.mem@example.com', 'finance');
  await invite('colleague', 'n.mem2@example.com', 'finance');
  await invite('outsider', 'n.out@example.com', 'marketing');
  director = signIn(portal, 'n.dir@example.com');
  member = signIn(portal, 'n.mem@example.com');
  colleague = signIn(portal, 'n.mem2@example.com');
  outsider = signIn(portal, 'n.out@example.com');
  project = (await admin.post('/api/projects', { name: 'Confidential pricing study', departmentIds: ['finance'] })).json.id;
});
after(async () => {
  await portal?.stop();
});
beforeEach(() => {
  portal.db.exec("DELETE FROM rate_limits; DELETE FROM notifications; UPDATE people SET status = 'active', department_id = 'finance' WHERE email LIKE 'n.mem%';");
});

const tasks = () => '/api/projects/' + project + '/tasks';
async function addTask(body) {
  const res = await director.post(tasks(), body);
  assert.equal(res.status, 201, res.text);
  return res.json.id;
}
const stored = () => portal.db.prepare('SELECT recipient_id AS recipient, kind, dedupe_key AS key FROM notifications ORDER BY id').all().map((row) => ({ ...row }));
const inbox = async (client, query = '') => {
  const res = await client.get('/api/notifications' + query);
  assert.equal(res.status, 200, res.text);
  return res.json;
};
async function runReminders() {
  const res = await fetch(portal.base + '/__void/scheduled', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-void-dev-trigger': portal.devToken },
    body: JSON.stringify({ cron: '5 * * * *', scheduledTime: NOW }),
  });
  assert.equal(res.status, 200, await res.text());
}

test('the inbox needs a session and validates its input', async () => {
  const anon = anonymous(portal);
  assert.equal((await anon.get('/api/notifications')).status, 401);
  assert.equal((await anon.get('/api/notifications/count')).status, 401);
  assert.equal((await anon.post('/api/notifications/read', { upTo: 1 })).status, 401);
  assert.equal((await member.get('/api/notifications?before=abc')).status, 400);
  assert.equal((await member.post('/api/notifications/read', {})).status, 400);
  assert.equal((await member.post('/api/notifications/read', { ids: [] })).status, 400);
  assert.equal((await member.post('/api/notifications/read', { ids: Array.from({ length: 51 }, (_, i) => i + 1) })).status, 400);
});

test('a notification write failure rolls back the assignment or comment that produced it', async () => {
  const taskId = await addTask({ title: 'Atomic comments', assigneeId: ids.member });
  portal.db.exec('DELETE FROM notifications');
  portal.db.exec("CREATE TRIGGER reject_notification BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'reject notification'); END;");
  try {
    const assignment = await director.post(tasks(), { title: 'Must roll back', assigneeId: ids.member });
    assert.equal(assignment.status, 500);
    assert.equal(portal.db.prepare("SELECT count(*) AS n FROM project_tasks WHERE title = 'Must roll back'").get().n, 0);
    const requestId = randomUUID();
    const comment = await colleague.post(`${tasks()}/${taskId}/comments`, { requestId, body: 'Must roll back too' });
    assert.equal(comment.status, 500);
    assert.equal(portal.db.prepare('SELECT count(*) AS n FROM task_comments WHERE request_id = ?').get(requestId).n, 0);
    assert.equal(portal.db.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'task.comment' AND target_id = ?").get(taskId).n, 0);
  } finally {
    portal.db.exec('DROP TRIGGER reject_notification');
  }
});

test('assigning a task tells the assignee once, never the person assigning themselves', async () => {
  const taskId = await addTask({ title: 'Draft survey', assigneeId: ids.member, dueDate: '2030-02-01' });
  await addTask({ title: 'Self-assigned', assigneeId: ids.director });
  assert.deepEqual(stored(), [{ recipient: ids.member, kind: 'task_assigned', key: `assigned:${taskId}:1` }]);

  // An edit that leaves the assignee alone, and a stale edit, add nothing.
  assert.equal((await director.patch(tasks() + '/' + taskId, { version: 1, title: 'Draft the survey' })).status, 200);
  assert.equal((await director.patch(tasks() + '/' + taskId, { version: 1, assigneeId: ids.colleague })).status, 409);
  assert.equal(stored().length, 1);

  assert.equal((await director.patch(tasks() + '/' + taskId, { version: 2, assigneeId: ids.colleague })).status, 200);
  assert.deepEqual(stored().at(-1), { recipient: ids.colleague, kind: 'task_assigned', key: `assigned:${taskId}:3` });

  const [notice] = (await inbox(colleague)).notifications;
  assert.deepEqual(
    [notice.kind, notice.taskId, notice.taskTitle, notice.projectId, notice.projectName, notice.actorName, notice.readAt],
    ['task_assigned', taskId, 'Draft the survey', project, 'Confidential pricing study', 'director', null],
  );
  assert.deepEqual((await member.get('/api/notifications/count')).json, { unread: 1, capped: false });
});

test('a comment tells the assignee, the task creator and earlier commenters, but not its author, and a retry adds nothing', async () => {
  const taskId = await addTask({ title: 'Model pricing', assigneeId: ids.member });
  portal.db.exec('DELETE FROM notifications');
  const comment = (client, body, requestId = randomUUID()) => client.post(tasks() + '/' + taskId + '/comments', { requestId, body });

  assert.equal((await comment(colleague, 'First thoughts')).status, 201);
  const requestId = randomUUID();
  const second = await comment(member, 'Agreed', requestId);
  assert.equal(second.status, 201);
  assert.equal((await comment(member, 'Agreed', requestId)).json.replayed, true);

  const notices = stored().filter((row) => row.kind === 'task_comment');
  const firstId = portal.db.prepare("SELECT id FROM task_comments WHERE body = 'First thoughts'").get().id;
  assert.deepEqual(
    notices.map((row) => [row.recipient, row.key]).sort(),
    [
      [ids.colleague, `comment:${second.json.id}`],
      [ids.director, `comment:${firstId}`],
      [ids.director, `comment:${second.json.id}`],
      [ids.member, `comment:${firstId}`],
    ].sort(),
  );
});

test('reminders cover open tasks due today or tomorrow (UTC) that the assignee can still see, once each', async () => {
  const dueToday = await addTask({ title: 'Due today', assigneeId: ids.member, dueDate: TODAY });
  const dueTomorrow = await addTask({ title: 'Due tomorrow', assigneeId: ids.colleague, dueDate: TOMORROW });
  await addTask({ title: 'Due later', assigneeId: ids.member, dueDate: '2030-01-17' });
  await addTask({ title: 'Overdue', assigneeId: ids.member, dueDate: '2030-01-14' });
  await addTask({ title: 'Unassigned', dueDate: TODAY });
  const done = await addTask({ title: 'Already done', assigneeId: ids.member, dueDate: TODAY });
  portal.db.prepare("UPDATE project_tasks SET status = 'completed' WHERE id = ?").run(done);
  portal.db.exec('DELETE FROM notifications');

  await runReminders();
  await runReminders();
  const due = () => stored().filter((row) => row.kind === 'task_due');
  assert.deepEqual(new Set(due()), new Set([
    { recipient: ids.member, kind: 'task_due', key: `due:${dueToday}:${TODAY}` },
    { recipient: ids.colleague, kind: 'task_due', key: `due:${dueTomorrow}:${TOMORROW}` },
  ]));

  // A moved deadline is a new reminder; alumni and people who lost sight of the project get none.
  portal.db.exec('DELETE FROM notifications');
  portal.db.prepare('UPDATE project_tasks SET due_date = ? WHERE id = ?').run(TOMORROW, dueToday);
  portal.db.prepare("UPDATE people SET status = 'alumni' WHERE id = ?").run(ids.colleague);
  await runReminders();
  assert.deepEqual(due(), [{ recipient: ids.member, kind: 'task_due', key: `due:${dueToday}:${TOMORROW}` }]);
  portal.db.exec('DELETE FROM notifications');
  portal.db.prepare("UPDATE people SET department_id = 'marketing' WHERE id = ?").run(ids.member);
  await runReminders();
  assert.deepEqual(due(), []);
  portal.db.exec("DELETE FROM project_tasks WHERE title IN ('Due today', 'Due tomorrow', 'Due later', 'Overdue', 'Unassigned', 'Already done')");
});

test('reading rechecks access and the task: revoked projects and removed tasks disappear without their names', async () => {
  const kept = await addTask({ title: 'Kept task', assigneeId: ids.member });
  const removed = await addTask({ title: 'Removed task', assigneeId: ids.member });
  assert.equal((await inbox(member)).notifications.length, 2);

  assert.equal((await director.del(tasks() + '/' + removed)).status, 200);
  assert.deepEqual((await inbox(member)).notifications.map((n) => n.taskId), [kept]);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM notifications WHERE task_id = ?').get(removed).n, 0);

  portal.db.prepare("UPDATE people SET department_id = 'marketing' WHERE id = ?").run(ids.member);
  const hidden = await member.get('/api/notifications');
  assert.deepEqual(hidden.json.notifications, []);
  assert.ok(!hidden.text.includes('Confidential pricing study'));
  assert.deepEqual((await member.get('/api/notifications/count')).json, { unread: 0, capped: false });
  assert.deepEqual((await inbox(outsider)).notifications, []);
});

test('marking read affects only the caller\'s own notices', async () => {
  await addTask({ title: 'Mine 1', assigneeId: ids.member });
  await addTask({ title: 'Mine 2', assigneeId: ids.member });
  await addTask({ title: 'Theirs', assigneeId: ids.colleague });
  const mine = (await inbox(member)).notifications.map((n) => n.id);
  const theirs = (await inbox(colleague)).notifications.map((n) => n.id);

  const res = await member.post('/api/notifications/read', { ids: [mine[0], ...theirs] });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.json, { unread: 1, capped: false });
  assert.deepEqual((await inbox(member, '?unread=1')).notifications.map((n) => n.id), [mine[1]]);
  assert.deepEqual((await colleague.get('/api/notifications/count')).json, { unread: 1, capped: false });

  // upTo past someone else's ids still reaches only the caller's rows.
  assert.deepEqual((await member.post('/api/notifications/read', { upTo: Math.max(...mine, ...theirs) })).json, { unread: 0, capped: false });
  assert.equal((await inbox(colleague, '?unread=1')).notifications.length, 1);
});

test('notices on hidden projects never crowd visible ones out of the page or the count', async () => {
  const visible = await addTask({ title: 'Visible task', assigneeId: ids.member });
  const hiddenProject = (await admin.post('/api/projects', { name: 'Marketing secret', departmentIds: ['marketing'] })).json.id;
  const hiddenTask = (await admin.post('/api/projects/' + hiddenProject + '/tasks', { title: 'Hidden task' })).json.id;
  const insert = portal.db.prepare("INSERT INTO notifications (recipient_id, kind, project_id, task_id, dedupe_key) VALUES (?, 'task_due', ?, ?, ?)");
  for (let i = 0; i < 150; i++) insert.run(ids.member, hiddenProject, hiddenTask, 'hidden:' + i);
  assert.deepEqual((await member.get('/api/notifications/count')).json, { unread: 1, capped: false });
  const page = await member.get('/api/notifications');
  assert.deepEqual(page.json.notifications.map((n) => n.taskId), [visible]);
  assert.equal(page.json.nextBefore, null);
  assert.ok(!page.text.includes('Marketing secret'));
});

test('the inbox pages 30 at a time and the unread count stops at 99', async () => {
  const taskId = await addTask({ title: 'Busy task', assigneeId: ids.colleague });
  const insert = portal.db.prepare("INSERT INTO notifications (recipient_id, kind, project_id, task_id, dedupe_key) VALUES (?, 'task_due', ?, ?, ?)");
  for (let i = 0; i < 120; i++) insert.run(ids.member, project, taskId, 'bulk:' + i);
  const seen = [];
  let cursor = null;
  do {
    const page = await inbox(member, cursor ? '?before=' + cursor : '');
    assert.ok(page.notifications.length <= 30);
    seen.push(...page.notifications.map((n) => n.id));
    cursor = page.nextBefore;
  } while (cursor);
  assert.equal(new Set(seen).size, 120);
  assert.deepEqual(seen, [...seen].sort((a, b) => b - a));
  assert.deepEqual((await member.get('/api/notifications/count')).json, { unread: 99, capped: true });
});
