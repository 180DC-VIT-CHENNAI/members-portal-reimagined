import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
const HOUR = 3_600_000;
let portal;
let admin;
let director; // finance director: manages club and finance meets, sees finance projects
let member; // finance member: sees meets and finance projects, manages nothing
let otherDirector; // marketing director: manages club meets, cannot see finance projects
let outsider; // marketing member
const ids = {};

async function invite(key, email, departmentId, accessRoleId) {
  const res = await admin.post('/api/people', { email, fullName: email.split('@')[0], departmentId, ...(accessRoleId ? { accessRoleId } : {}) });
  assert.equal(res.status, 201, res.text);
  ids[key] = res.json.id;
}

const at = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const schedule = async (client, body) => {
  const res = await client.post('/api/meets', { title: 'Weekly sync', scheduledAt: at(48 * HOUR), ...body });
  assert.equal(res.status, 201, res.text);
  return res.json.id;
};
const listed = async (client, meetId) => {
  const res = await client.get('/api/meets');
  assert.equal(res.status, 200, res.text);
  return { meet: res.json.find((m) => m.id === meetId), text: res.text };
};
const link = (client, meetId, projectId, taskId) => client.post(`/api/meets/${meetId}/action-items`, { projectId, taskId });
const unlink = (client, meetId, taskId) => client.del(`/api/meets/${meetId}/action-items/${taskId}`);
const links = (meetId) => portal.db.prepare('SELECT task_id FROM meet_action_items WHERE meet_id = ? ORDER BY task_id').all(meetId).map((r) => r.task_id);
const queued = () => portal.db.prepare('SELECT count(*) AS n FROM email_queue').get().n;

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, ADMIN);
  await invite('director', 'dir.finance@example.com', 'finance', 'director');
  await invite('member', 'mem.finance@example.com', 'finance');
  await invite('otherDirector', 'dir.marketing@example.com', 'marketing', 'director');
  await invite('outsider', 'mem.marketing@example.com', 'marketing');
  director = signIn(portal, 'dir.finance@example.com');
  member = signIn(portal, 'mem.finance@example.com');
  otherDirector = signIn(portal, 'dir.marketing@example.com');
  outsider = signIn(portal, 'mem.marketing@example.com');

  for (const [key, department, name, title] of [
    ['finance', 'finance', 'Secret finance study', 'Draft confidential budget'],
    ['marketing', 'marketing', 'Marketing push', 'Plan launch posts'],
  ]) {
    const project = await admin.post('/api/projects', { name, departmentIds: [department] });
    assert.ok(project.status < 300, project.text);
    ids[`${key}Project`] = project.json.id;
    const task = await admin.post(`/api/projects/${project.json.id}/tasks`, { title });
    assert.ok(task.status < 300, task.text);
    ids[`${key}Task`] = task.json.id;
  }
});
after(async () => {
  await portal?.stop();
});
beforeEach(() => {
  portal.db.exec('DELETE FROM rate_limits; DELETE FROM email_queue; DELETE FROM email_deliveries; DELETE FROM dev_outbox;');
});

test('follow-through routes need a session', async () => {
  const anon = anonymous(portal);
  assert.equal((await anon.patch('/api/meets/missing', { notes: 'x' })).status, 401);
  assert.equal((await link(anon, 'missing', 'p', 't')).status, 401);
  assert.equal((await unlink(anon, 'missing', 't')).status, 401);
});

test('managers edit agenda and notes; edits persist, clear, email nobody and leave the link rules alone', async () => {
  const meet = await schedule(director, { kind: 'department', departmentIds: ['finance'], meetLink: 'https://meet.example.com/f' });
  portal.db.exec('DELETE FROM email_queue');

  const saved = await director.patch(`/api/meets/${meet}`, { agenda: '  1. Budget\n2. Hiring  ', notes: 'Agreed to hire two analysts.' });
  assert.equal(saved.status, 200, saved.text);
  assert.deepEqual(saved.json, { id: meet, agenda: '1. Budget\n2. Hiring', notes: 'Agreed to hire two analysts.' });
  assert.equal(queued(), 0, 'editing follow-through queues no email');

  const seen = (await listed(member, meet)).meet;
  assert.equal(seen.agenda, '1. Budget\n2. Hiring');
  assert.equal(seen.notes, 'Agreed to hire two analysts.');
  assert.equal(seen.meetLink, 'https://meet.example.com/f');

  const notesOnly = await director.patch(`/api/meets/${meet}`, { notes: 'Revised.' });
  assert.equal(notesOnly.status, 200, notesOnly.text);
  const row = () => portal.db.prepare('SELECT agenda, notes FROM meets WHERE id = ?').get(meet);
  assert.deepEqual({ ...row() }, { agenda: '1. Budget\n2. Hiring', notes: 'Revised.' }, 'omitted fields are kept');
  assert.equal((await director.patch(`/api/meets/${meet}`, { agenda: '   ', notes: null })).status, 200);
  assert.deepEqual({ ...row() }, { agenda: null, notes: null }, 'empty values clear');

  assert.equal((await director.patch(`/api/meets/${meet}`, {})).status, 400);
  assert.equal((await director.patch(`/api/meets/${meet}`, { notes: 'x'.repeat(10001) })).status, 400);
  assert.equal((await director.patch('/api/meets/missing', { notes: 'x' })).status, 404);
  assert.equal((await member.patch(`/api/meets/${meet}`, { notes: 'mine now' })).status, 403);
  assert.equal((await otherDirector.patch(`/api/meets/${meet}`, { notes: 'mine now' })).status, 403);
  assert.equal(row().notes, null);

  portal.db.prepare("INSERT INTO meets (id, kind, title, meet_link, scheduled_at) VALUES ('old_meet', 'club', 'Old', 'https://meet.example.com/old', ?)").run(at(-48 * HOUR));
  assert.equal((await director.patch('/api/meets/old_meet', { notes: 'Minutes' })).status, 200);
  const old = (await listed(member, 'old_meet')).meet;
  assert.equal(old.notes, 'Minutes');
  assert.equal(old.meetLink, null, 'a past meet still hides its link after notes are added');

  const resent = await director.post(`/api/meets/${meet}/notify`, {});
  assert.equal(resent.status, 200, resent.text);
  const recipients = JSON.parse(portal.db.prepare('SELECT recipients FROM email_queue WHERE id = ?').get(resent.json.campaignId).recipients).sort();
  assert.deepEqual(recipients, ['dir.finance@example.com', 'mem.finance@example.com'], 'the audience is unchanged');
});

test('linking needs meet management and project visibility; a link never shows a hidden task', async () => {
  const meet = await schedule(director, { kind: 'club' });

  const added = await link(director, meet, ids.financeProject, ids.financeTask);
  assert.equal(added.status, 201, added.text);
  const again = await link(director, meet, ids.financeProject, ids.financeTask);
  assert.equal(again.status, 200, again.text);
  assert.equal(again.json.linked, false);
  assert.deepEqual(links(meet), [ids.financeTask]);

  // The marketing director manages club meets but cannot see the finance project.
  assert.equal((await link(otherDirector, meet, ids.financeProject, ids.financeTask)).status, 404);
  // Naming a visible project does not unlock a task from another one.
  assert.equal((await link(otherDirector, meet, ids.marketingProject, ids.financeTask)).status, 404);
  assert.equal((await link(director, meet, ids.financeProject, ids.marketingTask)).status, 404);
  // Seeing the project is not enough without managing the meet, even before any project lookup.
  assert.equal((await link(member, meet, ids.financeProject, ids.financeTask)).status, 403);
  assert.equal((await link(member, meet, 'missing', 'missing')).status, 403);
  assert.equal((await link(director, 'missing', ids.financeProject, ids.financeTask)).status, 404);
  assert.deepEqual(links(meet), [ids.financeTask]);

  assert.equal((await link(admin, meet, ids.marketingProject, ids.marketingTask)).status, 201);

  const forMember = await listed(member, meet);
  assert.deepEqual(
    forMember.meet.actionItems.map(({ taskId, projectId, projectName, title, status }) => ({ taskId, projectId, projectName, title, status })),
    [{ taskId: ids.financeTask, projectId: ids.financeProject, projectName: 'Secret finance study', title: 'Draft confidential budget', status: 'pending' }],
  );
  assert.ok(!forMember.text.includes('Plan launch posts'));

  for (const client of [outsider, otherDirector]) {
    const view = await listed(client, meet);
    assert.deepEqual(view.meet.actionItems.map((item) => item.taskId), [ids.marketingTask]);
    assert.ok(!view.text.includes('Draft confidential budget') && !view.text.includes('Secret finance study') && !view.text.includes(ids.financeTask));
  }
  // Viewing the meet gives no project access.
  assert.equal((await outsider.get(`/api/projects/${ids.financeProject}`)).status, 404);
});

test('unlinking needs the same rights and leaves the task alone', async () => {
  const meet = await schedule(director, { kind: 'club' });
  assert.equal((await link(director, meet, ids.financeProject, ids.financeTask)).status, 201);

  assert.equal((await unlink(otherDirector, meet, ids.financeTask)).status, 404);
  assert.equal((await unlink(member, meet, ids.financeTask)).status, 403);
  assert.equal((await unlink(director, meet, ids.marketingTask)).status, 404);
  assert.deepEqual(links(meet), [ids.financeTask]);

  const removed = await unlink(director, meet, ids.financeTask);
  assert.equal(removed.status, 200, removed.text);
  assert.deepEqual(links(meet), []);
  assert.equal((await unlink(director, meet, ids.financeTask)).status, 404);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM project_tasks WHERE id = ?').get(ids.financeTask).n, 1);
});

test('listings follow current project access and task state; deleting a task or meet drops its links', async () => {
  const meet = await schedule(director, { kind: 'club' });
  assert.equal((await link(director, meet, ids.financeProject, ids.financeTask)).status, 201);

  const done = await member.put(`/api/projects/${ids.financeProject}/tasks/${ids.financeTask}/status`, { status: 'completed' });
  assert.equal(done.status, 403, 'completion stays with the task routes and their rules');
  const completed = await director.put(`/api/projects/${ids.financeProject}/tasks/${ids.financeTask}/status`, { status: 'completed' });
  assert.equal(completed.status, 200, completed.text);
  assert.equal((await listed(member, meet)).meet.actionItems[0].status, 'completed');

  // Named on the project: the outsider now sees the item; removed again, it is hidden again.
  const added = await admin.post(`/api/projects/${ids.financeProject}/members`, { personId: ids.outsider, role: 'Analyst' });
  assert.ok(added.status < 300, added.text);
  assert.deepEqual((await listed(outsider, meet)).meet.actionItems.map((item) => item.taskId), [ids.financeTask]);
  assert.equal((await admin.del(`/api/projects/${ids.financeProject}/members/${added.json.id}`)).status, 200);
  assert.deepEqual((await listed(outsider, meet)).meet.actionItems, []);

  const extra = await admin.post(`/api/projects/${ids.financeProject}/tasks`, { title: 'Throwaway' });
  assert.ok(extra.status < 300, extra.text);
  assert.equal((await link(director, meet, ids.financeProject, extra.json.id)).status, 201);
  assert.equal((await admin.del(`/api/projects/${ids.financeProject}/tasks/${extra.json.id}`)).status, 200);
  assert.deepEqual(links(meet), [ids.financeTask]);

  assert.equal((await director.del(`/api/meets/${meet}`)).status, 200);
  assert.deepEqual(links(meet), []);
});
