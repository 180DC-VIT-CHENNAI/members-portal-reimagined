import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
let portal;
let admin;
let director; // finance director
let member; // finance member, assignee
let colleague; // another finance member
let outsider; // marketing member
const ids = {};
let project;
let taskId;

async function invite(key, email, departmentId, accessRoleId) {
  const res = await admin.post('/api/people', { email, fullName: email.split('@')[0], departmentId, ...(accessRoleId ? { accessRoleId } : {}) });
  assert.equal(res.status, 201, res.text);
  ids[key] = res.json.id;
}

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, ADMIN);
  await invite('director', 'dir.finance@example.com', 'finance', 'director');
  await invite('member', 'mem.finance@example.com', 'finance');
  await invite('colleague', 'mem2.finance@example.com', 'finance');
  await invite('outsider', 'mem.marketing@example.com', 'marketing');
  director = signIn(portal, 'dir.finance@example.com');
  member = signIn(portal, 'mem.finance@example.com');
  colleague = signIn(portal, 'mem2.finance@example.com');
  outsider = signIn(portal, 'mem.marketing@example.com');
  project = (await admin.post('/api/projects', { name: 'Market entry study', departmentIds: ['finance'] })).json.id;
  taskId = (await director.post('/api/projects/' + project + '/tasks', { title: 'Draft survey', assigneeId: ids.member })).json.id;
});
after(async () => {
  await portal?.stop();
});
beforeEach(() => {
  portal.db.exec('DELETE FROM rate_limits;');
});

const task = () => '/api/projects/' + project + '/tasks/' + taskId;
const comment = (client, body, requestId = randomUUID(), path = task()) => client.post(path + '/comments', { requestId, body });

test('comments and history need a session and a project the caller can see', async () => {
  const anon = anonymous(portal);
  assert.equal((await anon.get(task() + '/comments')).status, 401);
  assert.equal((await anon.get(task() + '/history')).status, 401);
  assert.equal((await outsider.get(task() + '/comments')).status, 404);
  assert.equal((await comment(outsider, 'hello')).status, 404);
  assert.equal((await outsider.get(task() + '/history')).status, 404);
  assert.equal((await member.get('/api/projects/' + project + '/tasks/missing/comments')).status, 404);
});

test('anyone who can see the project comments in plain text, and a retried post is stored once', async () => {
  const requestId = randomUUID();
  const first = await comment(member, '  <b>Looks</b> good\nto me  ', requestId);
  assert.equal(first.status, 201, first.text);
  assert.equal(first.json.replayed, false);
  assert.deepEqual((await comment(member, '  <b>Looks</b> good\nto me  ', requestId)).json, { id: first.json.id, replayed: true });
  assert.equal((await comment(member, 'Different text', requestId)).status, 409);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM task_comments').get().n, 1);
  const [shown] = (await colleague.get(task() + '/comments')).json.comments;
  assert.deepEqual([shown.body, shown.authorName, shown.removed, shown.canRemove], ['<b>Looks</b> good\nto me', 'mem.finance', false, false]);
  assert.equal((await comment(member, '   ')).status, 400);
  assert.equal((await comment(member, 'x'.repeat(4001))).status, 400);
  assert.equal((await member.post(task() + '/comments', { requestId: 'not-a-uuid', body: 'x' })).status, 400);
  assert.equal((await member.get('/api/projects/' + project)).json.tasks.find((t) => t.id === taskId).comments, 1);
});

test('authors remove their own comments, task managers remove anyone\'s, and the text is erased', async () => {
  const mine = (await comment(colleague, 'My note')).json.id;
  const theirs = (await comment(member, 'Their note')).json.id;
  assert.equal((await colleague.del(task() + '/comments/' + theirs)).status, 403);
  assert.equal((await colleague.del(task() + '/comments/' + mine)).status, 200);
  assert.equal((await colleague.del(task() + '/comments/' + mine)).status, 200);
  assert.equal((await director.del(task() + '/comments/' + theirs)).status, 200);
  const stored = portal.db.prepare('SELECT body, deleted_at FROM task_comments WHERE id = ?').get(mine);
  assert.equal(stored.body, '');
  assert.ok(stored.deleted_at);
  const shown = (await member.get(task() + '/comments')).json.comments.find((c) => c.id === mine);
  assert.deepEqual([shown.body, shown.removed, shown.canRemove], [null, true, false]);
  assert.equal(portal.db.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'task.comment.remove'").get().n, 2);
  assert.equal((await member.del(task() + '/comments/999999')).status, 404);
  assert.equal((await member.del(task() + '/comments/abc')).status, 404);
});

test('comments page 50 at a time, newest first, without gaps or repeats', async () => {
  const insert = portal.db.prepare("INSERT INTO task_comments (task_id, author_id, request_id, body, created_at) VALUES (?, ?, ?, ?, '2026-10-17 10:00:00')");
  for (let i = 0; i < 55; i++) insert.run(taskId, ids.member, randomUUID(), 'bulk ' + i);
  const total = portal.db.prepare('SELECT count(*) AS n FROM task_comments WHERE task_id = ?').get(taskId).n;
  const seen = [];
  let before = null;
  do {
    const page = await member.get(task() + '/comments' + (before ? '?before=' + before : ''));
    assert.equal(page.status, 200, page.text);
    assert.ok(page.json.comments.length <= 50);
    seen.push(...page.json.comments.map((c) => c.id));
    before = page.json.nextBefore;
  } while (before);
  assert.equal(seen.length, total);
  assert.equal(new Set(seen).size, total);
  assert.deepEqual(seen, [...seen].sort((a, b) => b - a));
  assert.equal((await member.get(task() + '/comments?before=abc')).status, 400);
  assert.equal((await member.get(task() + '/comments?before=0')).status, 400);
});

test('history shows who changed what, without comment text, comment ids or task details', async () => {
  const created = await director.post('/api/projects/' + project + '/tasks', { title: 'Collect data', assigneeId: ids.member, priority: 'high' });
  const path = '/api/projects/' + project + '/tasks/' + created.json.id;
  assert.equal((await member.put(path + '/status', { status: 'completed' })).status, 200);
  assert.equal((await director.patch(path, { version: 2, assigneeId: ids.colleague, dueDate: '2026-11-01', description: 'secret plan' })).status, 200);
  const said = (await comment(member, 'Comment text', randomUUID(), path)).json.id;
  assert.equal((await member.del(path + '/comments/' + said)).status, 200);
  const res = await colleague.get(path + '/history');
  assert.equal(res.status, 200, res.text);
  const { events } = res.json;
  assert.deepEqual(events.map((e) => e.action), ['task.comment.remove', 'task.comment', 'task.update', 'task.status', 'task.create']);
  const [removed, commented, update, status, made] = events;
  assert.deepEqual(made.to, { title: 'Collect data', assigneeId: ids.member, assigneeName: 'mem.finance', dueDate: null, priority: 'high', status: 'pending' });
  assert.deepEqual([status.actorName, status.from, status.to], ['mem.finance', { status: 'pending' }, { status: 'completed' }]);
  assert.deepEqual(update.from, { assigneeId: ids.member, assigneeName: 'mem.finance', dueDate: null, descriptionChanged: true });
  assert.deepEqual(update.to, { assigneeId: ids.colleague, assigneeName: 'mem2.finance', dueDate: '2026-11-01', descriptionChanged: true });
  assert.deepEqual([commented.to, removed.to], [{}, {}]);
  const raw = JSON.stringify(events);
  assert.ok(!raw.includes('Comment text') && !raw.includes('secret plan') && !raw.includes('commentId'));
  assert.equal(res.json.nextBefore, null);
});

test('today lists open tasks on active projects the person can still see, most urgent first', async () => {
  const p = (await admin.post('/api/projects', { name: 'Today checks', departmentIds: ['marketing'] })).json.id;
  const name = async (personId, role) => assert.equal((await admin.post('/api/projects/' + p + '/members', { personId, role })).status, 201);
  await name(ids.member, 'Helper');
  const add = async (body) => (await admin.post('/api/projects/' + p + '/tasks', { assigneeId: ids.member, ...body })).json.id;
  await add({ title: 'Later', dueDate: '2030-01-10' });
  await add({ title: 'Urgent undated', priority: 'urgent' });
  await add({ title: 'Soon', dueDate: '2030-01-01' });
  const done = await add({ title: 'Done already' });
  assert.equal((await member.put('/api/projects/' + p + '/tasks/' + done + '/status', { status: 'completed' })).status, 200);
  const titles = async () => (await member.get('/api/today')).json.tasks.filter((t) => t.projectId === p).map((t) => t.title);
  assert.deepEqual(await titles(), ['Soon', 'Later', 'Urgent undated']);
  const membership = (await admin.get('/api/projects/' + p)).json.members.find((m) => m.personId === ids.member).id;
  assert.equal((await admin.del('/api/projects/' + p + '/members/' + membership)).status, 200);
  assert.deepEqual(await titles(), [], 'tasks on a project they can no longer see are hidden');
  await name(ids.member, 'Helper');
  assert.equal((await titles()).length, 3);
  assert.equal((await admin.put('/api/projects/' + p + '/status', { status: 'completed' })).status, 200);
  assert.deepEqual(await titles(), [], 'completed projects drop out');
});

test('today shows blocked tasks with their reason after open ones', async () => {
  const p = (await admin.post('/api/projects', { name: 'Today blocked', departmentIds: ['finance'] })).json.id;
  const add = async (body) => (await admin.post('/api/projects/' + p + '/tasks', { assigneeId: ids.member, ...body })).json.id;
  const stuck = await add({ title: 'Stuck early', dueDate: '2030-01-01', priority: 'urgent' });
  await add({ title: 'Open later', dueDate: '2030-02-01' });
  assert.equal((await member.put('/api/projects/' + p + '/tasks/' + stuck + '/status', { status: 'blocked', blockedReason: 'Waiting on access' })).status, 200);
  const mine = async () => (await member.get('/api/today')).json.tasks.filter((t) => t.projectId === p).map((t) => [t.title, t.status, t.blockedReason]);
  assert.deepEqual(await mine(), [['Open later', 'pending', null], ['Stuck early', 'blocked', 'Waiting on access']]);
  assert.equal((await member.put('/api/projects/' + p + '/tasks/' + stuck + '/status', { status: 'completed' })).status, 200);
  assert.deepEqual(await mine(), [['Open later', 'pending', null]]);
});

test('today filters, orders and caps tasks in the database with the same visibility rules', async () => {
  // Fresh people so no shared fixture changes: one with only projects.manage for
  // finance, one with only departments.projects.manage for finance; both in marketing.
  await invite('pm', 'pm.marketing@example.com', 'marketing');
  await invite('lead', 'lead.marketing@example.com', 'marketing');
  for (const [key, permission] of [['pm', 'projects.manage'], ['lead', 'departments.projects.manage']]) {
    const res = await admin.put('/api/people/' + ids[key] + '/access', { accessRoleId: 'member', grants: [{ permission, departmentId: 'finance' }] });
    assert.equal(res.status, 200, res.text);
  }
  const pm = signIn(portal, 'pm.marketing@example.com');
  const lead = signIn(portal, 'lead.marketing@example.com');
  const addProject = (name, departments, internal = 0) => {
    const id = randomUUID();
    portal.db.prepare("INSERT INTO projects (id, name, status, internal) VALUES (?, ?, 'active', ?)").run(id, name, internal);
    for (const department of departments) portal.db.prepare('INSERT INTO project_departments (project_id, department_id) VALUES (?, ?)').run(id, department);
    return id;
  };
  const insertTask = portal.db.prepare('INSERT INTO project_tasks (id, project_id, title, assignee_id, due_date, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const assign = (projectId, title, personId, dueDate = null, priority = 'normal', createdAt = '2026-10-01 10:00:00') =>
    insertTask.run(randomUUID(), projectId, title, personId, dueDate, priority, createdAt);
  const titles = async (client) => (await client.get('/api/today')).json.tasks.map((t) => t.title);

  const financeOnly = addProject('Finance only', ['finance']);
  const joint = addProject('Joint', ['finance', 'operations']);
  const internal = addProject('Internal', ['finance'], 1);
  const internalJoint = addProject('Internal joint', ['finance', 'operations'], 1);
  const unlinked = addProject('No departments', []);
  for (const [projectId, title] of [[financeOnly, 'finance'], [joint, 'joint'], [internal, 'internal'], [internalJoint, 'internal joint'], [unlinked, 'unlinked']]) {
    assign(projectId, title, ids.pm);
    assign(projectId, title, ids.lead);
  }
  assert.deepEqual(await titles(pm), ['finance'], 'client management alone never opens internal work');
  assert.deepEqual(await titles(lead), ['internal'], 'departments.projects.manage reaches only internal projects wholly in its departments');

  // Order matches compareTasks; the 101st row only sets hasMoreTasks.
  assign(financeOnly, 'undated old', ids.pm, null, 'normal', '2026-09-01 10:00:00');
  assign(financeOnly, 'due high', ids.pm, '2030-01-01', 'high');
  assign(financeOnly, 'due urgent', ids.pm, '2030-01-01', 'urgent');
  assign(financeOnly, 'due sooner low', ids.pm, '2029-12-31', 'low');
  assert.deepEqual((await titles(pm)).slice(0, 4), ['due sooner low', 'due urgent', 'due high', 'undated old']);
  for (let i = 0; i < 95; i++) assign(financeOnly, 'filler', ids.pm);
  let page = (await pm.get('/api/today')).json;
  assert.deepEqual([page.tasks.length, page.hasMoreTasks], [100, false]);
  assign(financeOnly, 'one more', ids.pm);
  page = (await pm.get('/api/today')).json;
  assert.deepEqual([page.tasks.length, page.hasMoreTasks], [100, true]);
});

test('today shows the next seven days of visible meets, the latest announcements and attention counts only for admins', async () => {
  const at = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();
  assert.equal((await director.post('/api/meets', { kind: 'club', title: 'Tomorrow club', scheduledAt: at(24) })).status, 201);
  assert.equal((await director.post('/api/meets', { kind: 'club', title: 'Next month', scheduledAt: at(24 * 30) })).status, 201);
  assert.equal((await admin.post('/api/meets', { kind: 'department', departmentIds: ['marketing'], title: 'Marketing only', scheduledAt: at(48) })).status, 201);
  assert.equal((await admin.post('/api/meets', { kind: 'inter_department', departmentIds: ['marketing'], title: 'Marketing workshop', scheduledAt: at(36) })).status, 201);
  portal.db.prepare("INSERT INTO meets (id, kind, title, scheduled_at) VALUES ('past', 'club', 'Yesterday', ?)").run(at(-24));
  assert.equal((await admin.post('/api/announcements', { title: 'Welcome back', content: 'Hello everyone' })).status, 201);
  const mine = (await member.get('/api/today')).json;
  assert.deepEqual(mine.meets.map((m) => m.title), ['Tomorrow club']);
  assert.equal(mine.announcements[0].title, 'Welcome back');
  assert.deepEqual(mine.attention, {});
  const admins = (await admin.get('/api/today')).json;
  assert.deepEqual(Object.keys(admins.attention).sort(), ['failedEmails', 'invited']);
  assert.equal(admins.attention.invited, 0);
  assert.equal((await anonymous(portal).get('/api/today')).status, 401);
});


test('comment creation and its audit are atomic', async () => {
  const requestId = randomUUID();
  portal.db.exec("CREATE TRIGGER reject_comment_audit BEFORE INSERT ON audit_log WHEN NEW.action = 'task.comment' BEGIN SELECT RAISE(ABORT, 'injected_audit_failure'); END;");
  try {
    assert.equal((await comment(member, 'Keep comment and history together', requestId)).status, 500);
    assert.equal(portal.db.prepare('SELECT count(*) AS n FROM task_comments WHERE request_id = ?').get(requestId).n, 0);
  } finally {
    portal.db.exec('DROP TRIGGER reject_comment_audit;');
  }
});

test('comment removal and its audit are atomic', async () => {
  const id = (await comment(member, 'Do not erase without history')).json.id;
  portal.db.exec("CREATE TRIGGER reject_remove_audit BEFORE INSERT ON audit_log WHEN NEW.action = 'task.comment.remove' BEGIN SELECT RAISE(ABORT, 'injected_audit_failure'); END;");
  try {
    assert.equal((await member.del(task() + '/comments/' + id)).status, 500);
    const row = portal.db.prepare('SELECT body, deleted_at FROM task_comments WHERE id = ?').get(id);
    assert.equal(row.body, 'Do not erase without history');
    assert.equal(row.deleted_at, null);
  } finally {
    portal.db.exec('DROP TRIGGER reject_remove_audit;');
  }
});


test('history cursor paging has no gaps when events share a timestamp', async () => {
  const insert = portal.db.prepare("INSERT INTO audit_log (actor_person_id, action, target_type, target_id, details, created_at) VALUES (?, 'task.update', 'task', ?, ?, '2026-10-17 10:00:00')");
  const details = JSON.stringify({ projectId: project, from: { priority: 'normal' }, to: { priority: 'high' } });
  for (let i = 0; i < 55; i++) insert.run(ids.director, taskId, details);
  const expected = portal.db.prepare("SELECT id FROM audit_log WHERE target_type = 'task' AND target_id = ? AND json_extract(details, '$.projectId') = ? AND action IN ('task.create','task.update','task.status','task.comment','task.comment.remove') ORDER BY id DESC").all(taskId, project).map((r) => r.id);
  const seen = [];
  let before;
  do {
    const res = await member.get(task() + '/history' + (before ? '?before=' + before : ''));
    assert.equal(res.status, 200, res.text);
    assert.ok(res.json.events.length <= 50);
    seen.push(...res.json.events.map((e) => e.id));
    before = res.json.nextBefore;
  } while (before);
  assert.deepEqual(seen, expected);
  assert.equal(new Set(seen).size, expected.length);
  assert.equal((await member.get(task() + '/history?before=-1')).status, 400);
});

test('comment retries are still counted by the write rate limit', async () => {
  const requestId = randomUUID();
  for (let i = 0; i < 30; i++) {
    const res = await comment(member, 'A single stored note', requestId);
    assert.equal(res.status, 201, res.text);
    assert.equal(res.json.replayed, i > 0);
  }
  assert.equal((await comment(member, 'A single stored note', requestId)).status, 429);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM task_comments WHERE author_id = ? AND request_id = ?').get(ids.member, requestId).n, 1);
});
