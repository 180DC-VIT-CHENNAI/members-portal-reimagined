import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
let portal;
let admin;
let director; // finance director
let member; // finance member
let colleague; // another finance member
let outsider; // marketing member
let otherDirector; // marketing director
let manager; // finance member with projects.manage for finance only
const ids = {};

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
  await invite('otherDirector', 'dir.marketing@example.com', 'marketing', 'director');
  await invite('manager', 'pm.finance@example.com', 'finance');
  await invite('alumni', 'alumni@example.com', 'finance');
  director = signIn(portal, 'dir.finance@example.com');
  member = signIn(portal, 'mem.finance@example.com');
  colleague = signIn(portal, 'mem2.finance@example.com');
  outsider = signIn(portal, 'mem.marketing@example.com');
  otherDirector = signIn(portal, 'dir.marketing@example.com');
  manager = signIn(portal, 'pm.finance@example.com');
  signIn(portal, 'alumni@example.com');
  assert.equal((await admin.post('/api/people/' + ids.alumni + '/status', { status: 'alumni' })).status, 200);
  const grant = await admin.put('/api/people/' + ids.manager + '/access', { accessRoleId: 'member', grants: [{ permission: 'projects.manage', departmentId: 'finance' }] });
  assert.equal(grant.status, 200, grant.text);
});
after(async () => {
  await portal?.stop();
});
beforeEach(() => {
  portal.db.exec('DELETE FROM rate_limits; DELETE FROM email_queue;');
});

const create = (client, body) => client.post('/api/projects', { name: 'Market entry study', departmentIds: ['finance'], ...body });
const detail = (client, id) => client.get('/api/projects/' + id);
const addTask = (client, id, body) => client.post('/api/projects/' + id + '/tasks', { title: 'Draft survey', ...body });
const task = async (id, taskId) => (await detail(admin, id)).json.tasks.find((t) => t.id === taskId);
const campaigns = () => portal.db.prepare("SELECT subject, html, recipients FROM email_queue WHERE kind = 'project' ORDER BY created_at").all();
let project; // finance project shared by the tests below, in order

test('projects need a session; the completed list is public', async () => {
  const anon = anonymous(portal);
  assert.equal((await anon.get('/api/projects')).status, 401);
  assert.equal((await anon.post('/api/projects', { name: 'x', departmentIds: ['finance'] })).status, 401);
  assert.equal((await anon.get('/api/projects/missing')).status, 401);
  const open = await anon.get('/api/content/projects');
  assert.equal(open.status, 200, open.text);
  assert.deepEqual(open.json, []);
});

test('admins create projects and the departments\' leads are emailed', async () => {
  const res = await create(admin, { name: 'Market entry <study>', client: 'Acme & Co', deadline: '2026-12-15', departmentIds: ['finance', 'finance'] });
  assert.equal(res.status, 201, res.text);
  project = res.json.id;
  assert.equal(res.json.notified, 1);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM project_departments WHERE project_id = ?').get(project).n, 1);
  const [mail] = campaigns();
  assert.deepEqual(JSON.parse(mail.recipients), ['dir.finance@example.com']);
  assert.equal(mail.subject, 'New project: Market entry <study>');
  assert.ok(mail.html.includes('Market entry &lt;study&gt;') && mail.html.includes('Acme &amp; Co') && mail.html.includes('15 Dec 2026'));
  assert.equal((await create(director, {})).status, 403);
  assert.equal((await create(member, {})).status, 403);
});

test('project input is validated', async () => {
  assert.equal((await create(admin, { name: '  ' })).status, 400);
  assert.equal((await create(admin, { departmentIds: [] })).status, 400);
  assert.equal((await create(admin, { departmentIds: ['nope'] })).status, 400);
  assert.equal((await create(admin, { deadline: '2026-02-30' })).status, 400);
  assert.equal((await create(admin, { termId: 'nope' })).status, 400);
});

test('people see their own departments\' projects; anyone else gets 404', async () => {
  const listed = (await member.get('/api/projects')).json.find((p) => p.id === project);
  assert.deepEqual(listed.access, { view: true, manage: false, manageMembers: false, manageTasks: false });
  assert.deepEqual(listed.departments.map((d) => d.id), ['finance']);
  assert.ok(!(await outsider.get('/api/projects')).json.some((p) => p.id === project));
  assert.equal((await detail(outsider, project)).status, 404);
  assert.deepEqual((await detail(director, project)).json.access, { view: true, manage: false, manageMembers: true, manageTasks: true });
});

test('naming someone on a project lets them see it but never manage it', async () => {
  const added = await director.post('/api/projects/' + project + '/members', { personId: ids.outsider, role: 'Analyst' });
  assert.equal(added.status, 201, added.text);
  const mail = campaigns().find((c) => c.subject === 'Added to Market entry <study> as Analyst');
  assert.deepEqual(JSON.parse(mail.recipients), ['mem.marketing@example.com']);
  assert.equal((await detail(outsider, project)).status, 200);
  const reviewer = await director.post('/api/projects/' + project + '/members', { personId: ids.otherDirector, role: 'Reviewer' });
  assert.equal(reviewer.status, 201, reviewer.text);
  assert.deepEqual((await detail(otherDirector, project)).json.access, { view: true, manage: false, manageMembers: false, manageTasks: false });
  assert.equal((await addTask(otherDirector, project, {})).status, 403);
  assert.equal((await director.post('/api/projects/' + project + '/members', { personId: ids.outsider, role: 'Lead' })).status, 409);
  assert.equal((await director.post('/api/projects/' + project + '/members', { personId: ids.alumni, role: 'Lead' })).status, 400);
  assert.equal((await member.post('/api/projects/' + project + '/members', { personId: ids.colleague, role: 'Lead' })).status, 403);
  assert.equal((await director.del('/api/projects/' + project + '/members/' + reviewer.json.id)).status, 200);
  assert.equal((await detail(otherDirector, project)).status, 404);
  assert.equal((await director.del('/api/projects/' + project + '/members/' + reviewer.json.id)).status, 404);
});

test('tasks: assignees must see the project and complete only their own; edits need the current version', async () => {
  const made = await addTask(director, project, { assigneeId: ids.member, dueDate: '2026-11-01', priority: 'high' });
  assert.equal(made.status, 201, made.text);
  const id = made.json.id;
  assert.equal((await addTask(director, project, { assigneeId: ids.otherDirector })).status, 400);
  assert.equal((await addTask(director, project, { dueDate: '2026-02-29' })).status, 400);
  assert.equal((await addTask(director, project, { dueDate: '2028-02-29', assigneeId: ids.outsider })).status, 201);
  assert.equal((await addTask(member, project, {})).status, 403);
  let current = await task(project, id);
  assert.equal(current.status, 'pending');
  assert.equal(current.version, 1);
  assert.equal((await detail(member, project)).json.tasks.find((t) => t.id === id).canUpdateStatus, true);
  assert.equal((await detail(colleague, project)).json.tasks.find((t) => t.id === id).canUpdateStatus, false);

  const done = await member.put('/api/projects/' + project + '/tasks/' + id + '/status', { status: 'completed' });
  assert.deepEqual(done.json, { version: 2, changed: true });
  assert.ok((await task(project, id)).completedAt);
  assert.deepEqual((await member.put('/api/projects/' + project + '/tasks/' + id + '/status', { status: 'completed' })).json, { version: 2, changed: false });
  assert.equal((await colleague.put('/api/projects/' + project + '/tasks/' + id + '/status', { status: 'pending' })).status, 403);

  const stale = await director.patch('/api/projects/' + project + '/tasks/' + id, { version: 1, priority: 'low' });
  assert.equal(stale.status, 409, stale.text);
  const edited = await director.patch('/api/projects/' + project + '/tasks/' + id, { version: 2, priority: 'low', dueDate: null, title: 'Draft the survey' });
  assert.deepEqual(edited.json, { version: 3, changed: true });
  current = await task(project, id);
  assert.deepEqual([current.priority, current.dueDate, current.title], ['low', null, 'Draft the survey']);
  assert.deepEqual((await director.patch('/api/projects/' + project + '/tasks/' + id, { version: 1, priority: 'low' })).json, { version: 3, changed: false });
  assert.equal((await member.patch('/api/projects/' + project + '/tasks/' + id, { version: 3, priority: 'high' })).status, 403);
  assert.equal((await director.patch('/api/projects/' + project + '/tasks/' + id, { version: 3, assigneeId: ids.otherDirector })).status, 400);
  const reopened = await member.put('/api/projects/' + project + '/tasks/' + id + '/status', { status: 'pending' });
  assert.deepEqual(reopened.json, { version: 4, changed: true });
  assert.equal((await task(project, id)).completedAt, null);
  const history = portal.db.prepare("SELECT action FROM audit_log WHERE target_type = 'task' AND target_id = ? ORDER BY id").all(id).map((row) => row.action);
  assert.deepEqual(history, ['task.create', 'task.status', 'task.update', 'task.status']);
});

test('completing all tasks closes open ones once and keeps earlier completion times', async () => {
  const first = (await addTask(director, project, { title: 'Collect data' })).json.id;
  const second = (await addTask(director, project, { title: 'Write report' })).json.id;
  await director.put('/api/projects/' + project + '/tasks/' + first + '/status', { status: 'completed' });
  const before = (await task(project, first)).completedAt;
  assert.equal((await member.post('/api/projects/' + project + '/complete-tasks', {})).status, 403);
  const res = await director.post('/api/projects/' + project + '/complete-tasks', {});
  assert.equal(res.status, 200, res.text);
  const tasks = (await detail(admin, project)).json.tasks;
  assert.equal(res.json.completed, tasks.length - 1);
  assert.ok(tasks.every((t) => t.status === 'completed'));
  assert.equal((await task(project, first)).completedAt, before);
  assert.equal(portal.db.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'task.status' AND json_extract(details, '$.bulk') = 1").get().n, res.json.completed);
  assert.equal((await director.post('/api/projects/' + project + '/complete-tasks', {})).json.completed, 0);
  assert.equal((await director.del('/api/projects/' + project + '/tasks/' + second)).status, 200);
  assert.equal((await director.del('/api/projects/' + project + '/tasks/' + second)).status, 404);
});

test('blocking a task needs a reason; unblocking, completing and reopening keep the version rules', async () => {
  const p = (await create(admin, { name: 'Blocked checks' })).json.id;
  const id = (await addTask(director, p, { assigneeId: ids.member })).json.id;
  const status = (client, body) => client.put('/api/projects/' + p + '/tasks/' + id + '/status', body);
  assert.equal((await status(member, { status: 'blocked' })).status, 400);
  assert.equal((await status(member, { status: 'blocked', blockedReason: '   ' })).status, 400);
  assert.equal((await status(member, { status: 'paused' })).status, 400);
  assert.equal((await status(colleague, { status: 'blocked', blockedReason: 'Not mine' })).status, 403);
  assert.deepEqual((await status(member, { status: 'blocked', blockedReason: '  Waiting on\n the client  ' })).json, { version: 2, changed: true });
  let current = await task(p, id);
  assert.deepEqual([current.status, current.blockedReason, current.completedAt], ['blocked', 'Waiting on the client', null]);
  assert.deepEqual((await status(member, { status: 'blocked', blockedReason: 'Waiting on the client' })).json, { version: 2, changed: false });
  assert.deepEqual((await status(director, { status: 'blocked', blockedReason: 'Waiting on data' })).json, { version: 3, changed: true });
  assert.equal((await director.patch('/api/projects/' + p + '/tasks/' + id, { version: 2, priority: 'high' })).status, 409);
  assert.equal((await task(p, id)).blockedReason, 'Waiting on data');

  assert.deepEqual((await status(member, { status: 'pending', blockedReason: 'ignored' })).json, { version: 4, changed: true });
  current = await task(p, id);
  assert.deepEqual([current.status, current.blockedReason], ['pending', null]);
  await status(member, { status: 'blocked', blockedReason: 'Again' });
  assert.deepEqual((await status(member, { status: 'completed' })).json, { version: 6, changed: true });
  current = await task(p, id);
  assert.deepEqual([current.status, current.blockedReason, Boolean(current.completedAt)], ['completed', null, true]);
  assert.deepEqual((await status(member, { status: 'pending' })).json, { version: 7, changed: true });

  await status(member, { status: 'blocked', blockedReason: 'Last one' });
  const open = (await addTask(director, p, { title: 'Still open' })).json.id;
  const res = await director.post('/api/projects/' + p + '/complete-tasks', {});
  assert.deepEqual(res.json, { completed: 2 });
  current = await task(p, id);
  assert.deepEqual([current.status, current.blockedReason, current.version], ['completed', null, 9]);
  const audit = portal.db
    .prepare("SELECT json_extract(details, '$.from') AS f, json_extract(details, '$.to') AS t, json_extract(details, '$.blockedReason') AS r, json_extract(details, '$.bulk') AS b FROM audit_log WHERE action = 'task.status' AND target_id = ? ORDER BY id")
    .all(id)
    .map(({ f, t, r, b }) => [f, t, r, b]);
  assert.deepEqual(audit, [
    ['pending', 'blocked', 'Waiting on the client', null],
    ['blocked', 'blocked', 'Waiting on data', null],
    ['blocked', 'pending', null, null],
    ['pending', 'blocked', 'Again', null],
    ['blocked', 'completed', null, null],
    ['completed', 'pending', null, null],
    ['pending', 'blocked', 'Last one', null],
    ['blocked', 'completed', null, 1],
  ]);
  assert.equal(portal.db.prepare("SELECT json_extract(details, '$.from') AS f FROM audit_log WHERE action = 'task.status' AND target_id = ?").get(open).f, 'pending');
});

test('the people picker lists everyone with access and whether they can see the project', async () => {
  const people = await director.get('/api/projects/' + project + '/people');
  assert.equal(people.status, 200, people.text);
  const byId = new Map(people.json.map((p) => [p.id, p]));
  assert.equal(byId.get(ids.member).canSee, true);
  assert.deepEqual([byId.get(ids.outsider).canSee, byId.get(ids.outsider).member], [true, true]);
  assert.equal(byId.get(ids.otherDirector).canSee, false);
  assert.equal(byId.has(ids.alumni), false);
  assert.equal((await member.get('/api/projects/' + project + '/people')).status, 403);
});

test('completing a project publishes it; reopening and removing take it down', async () => {
  const publicList = async () => (await anonymous(portal).get('/api/content/projects')).json;
  assert.equal((await director.put('/api/projects/' + project + '/status', { status: 'completed' })).status, 403);
  assert.deepEqual((await admin.put('/api/projects/' + project + '/status', { status: 'completed' })).json, { status: 'completed', changed: true });
  const [shown] = await publicList();
  assert.deepEqual(Object.keys(shown).sort(), ['client', 'completedAt', 'description', 'id', 'name']);
  assert.equal(shown.name, 'Market entry <study>');
  await admin.put('/api/projects/' + project + '/status', { status: 'active' });
  assert.deepEqual(await publicList(), []);
  await admin.put('/api/projects/' + project + '/status', { status: 'completed' });
  assert.equal((await director.del('/api/projects/' + project)).status, 403);
  assert.equal((await admin.del('/api/projects/' + project)).status, 200);
  assert.deepEqual(await publicList(), []);
  for (const table of ['project_tasks', 'project_members', 'project_departments']) {
    assert.equal(portal.db.prepare('SELECT count(*) AS n FROM ' + table + ' WHERE project_id = ?').get(project).n, 0, table);
  }
  assert.equal((await detail(admin, project)).status, 404);
});

test('a department-scoped projects.manage grant covers only projects wholly in that department', async () => {
  const own = await create(manager, { name: 'Finance only' });
  assert.equal(own.status, 201, own.text);
  assert.equal((await create(manager, { name: 'Joint', departmentIds: ['finance', 'marketing'] })).status, 403);
  const joint = (await create(admin, { name: 'Joint', departmentIds: ['finance', 'marketing'] })).json.id;
  assert.equal((await detail(manager, joint)).json.access.manage, false);
  assert.equal((await manager.del('/api/projects/' + joint)).status, 403);
  assert.equal((await manager.patch('/api/projects/' + own.json.id, { departmentIds: ['marketing'] })).status, 403);
  const renamed = await manager.patch('/api/projects/' + own.json.id, { name: 'Finance review', client: '' });
  assert.equal(renamed.status, 200, renamed.text);
  const after = (await detail(manager, own.json.id)).json;
  assert.deepEqual([after.name, after.client], ['Finance review', null]);
  assert.equal((await manager.del('/api/projects/' + own.json.id)).status, 200);
});
