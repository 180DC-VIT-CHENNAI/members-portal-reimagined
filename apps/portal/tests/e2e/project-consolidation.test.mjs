import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';
import { verifyPortalBackup } from '../../../../scripts/verify-portal-backup.mjs';
import { anonymous, signIn, startPortal } from './harness.mjs';

const migrationsDir = new URL('../../db/migrations/', import.meta.url);
const migrations = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
const consolidation = '20261018224557_mature_spacker_dave.sql';
const sql = (name) => readFileSync(new URL(name, migrationsDir), 'utf8');

test('additive consolidation preserves old department rows, identifiers and privacy even with an id collision', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const file of migrations) {
      if (file === consolidation) break;
      db.exec(sql(file));
    }
    db.exec(`INSERT INTO projects (id,name) VALUES ('same-id','Existing client project');
      INSERT INTO department_projects (id,department_id,name,status,deadline)
      VALUES ('same-id','finance','Internal budget','completed','2026-12-01');`);
    db.exec(sql(consolidation));
    const copied = db.prepare("SELECT * FROM projects WHERE legacy_department_project_id = 'same-id'").get();
    assert.equal(copied.internal, 1);
    assert.equal(copied.status, 'completed');
    assert.equal(copied.deadline, '2026-12-01');
    assert.notEqual(copied.id, 'same-id');
    assert.equal(db.prepare("SELECT name FROM projects WHERE id = 'same-id'").get().name, 'Existing client project');
    assert.equal(db.prepare('SELECT department_id FROM project_departments WHERE project_id = ?').get(copied.id).department_id, 'finance');
    assert.equal(db.prepare('SELECT count(*) AS n FROM department_projects').get().n, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('the full portal schema and seeded reference data pass the offline restore verifier', () => {
  const result = verifyPortalBackup(migrations.map(sql).join('\n'));
  assert.equal(result.integrity, 'ok');
  assert.equal(result.foreignKeys, 'ok');
  assert.ok(result.tables > 30);
  assert.ok(result.roles > 0);
});

let portal, admin, director, outsider, member, memberId;
before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, 'srijan.guchhait@gmail.com');
  for (const [email, departmentId, accessRoleId] of [
    ['consolidate-director@example.com', 'finance', 'director'],
    ['consolidate-outsider@example.com', 'marketing', 'member'],
  ]) {
    const response = await admin.post('/api/people', { email, fullName: email, departmentId, accessRoleId });
    assert.equal(response.status, 201, response.text);
  }
  director = signIn(portal, 'consolidate-director@example.com');
  outsider = signIn(portal, 'consolidate-outsider@example.com');
  const person = await admin.post('/api/people', { email: 'consolidate-member@example.com', fullName: 'Finance member', departmentId: 'finance' });
  assert.equal(person.status, 201, person.text);
  memberId = person.json.id;
  member = signIn(portal, 'consolidate-member@example.com');
});
after(async () => { await portal?.stop(); });

test('department projects have one editable canonical workspace and never publish when completed', async () => {
  const created = await director.post('/api/departments/finance/projects', { name: 'Department budget' });
  assert.equal(created.status, 201, created.text);
  const id = created.json.id;
  const detail = await director.get(`/api/projects/${id}`);
  assert.equal(detail.status, 200, detail.text);
  assert.equal(detail.json.internal, true);
  assert.equal(detail.json.access.manage, true);
  assert.equal(detail.json.status, 'upcoming');
  assert.equal((await outsider.get(`/api/projects/${id}`)).status, 404);
  assert.equal((await member.get(`/api/projects/${id}`)).status, 404);
  assert.ok(!(await member.get('/api/projects')).json.some((project) => project.id === id));
  const added = await director.post(`/api/projects/${id}/members`, { personId: memberId, role: 'Analyst' });
  assert.equal(added.status, 201, added.text);
  assert.equal((await member.get(`/api/projects/${id}`)).status, 200);
  assert.equal((await director.put(`/api/projects/${id}/status`, { status: 'active' })).status, 200);
  const task = await director.post(`/api/projects/${id}/tasks`, { title: 'Private planning task', assigneeId: memberId });
  assert.equal(task.status, 201, task.text);
  assert.ok((await member.get('/api/today')).json.tasks.some((item) => item.id === task.json.id));
  assert.equal((await member.get('/api/notifications/count')).json.unread, 1);
  assert.equal((await director.del(`/api/projects/${id}/members/${added.json.id}`)).status, 200);
  assert.ok(!(await member.get('/api/today')).json.tasks.some((item) => item.id === task.json.id));
  assert.equal((await member.get('/api/notifications/count')).json.unread, 0);
  assert.equal((await director.patch(`/api/projects/${id}`, { name: 'Corrected budget' })).status, 200);
  assert.equal((await director.patch(`/api/projects/${id}`, { internal: false })).status, 403);
  assert.equal((await director.post('/api/projects', { name: 'Cannot publish', departmentIds: ['finance'], internal: false })).status, 403);
  assert.equal((await director.put(`/api/departments/finance/projects/${id}/status`, { status: 'completed' })).status, 200);
  const publicList = await anonymous(portal).get('/api/content/projects');
  assert.ok(!publicList.json.some((project) => project.id === id));
  const overview = await director.get('/api/departments/finance/overview');
  assert.equal(overview.json.projects.find((project) => project.id === id).name, 'Corrected budget');
  assert.equal((await director.del(`/api/projects/${id}`)).status, 200);
  assert.equal((await director.get(`/api/projects/${id}`)).status, 404);
});

test('compatibility routes resolve migrated ids and cannot change joint work through one department', async () => {
  const id = crypto.randomUUID();
  portal.db.prepare(`INSERT INTO projects (id,name,internal,legacy_department_project_id) VALUES (?, 'Migrated', 1, 'old-project-id')`).run(id);
  portal.db.prepare('INSERT INTO project_departments (project_id,department_id) VALUES (?,?)').run(id, 'finance');
  const changed = await director.put('/api/departments/finance/projects/old-project-id/status', { status: 'on_hold' });
  assert.equal(changed.status, 200, changed.text);
  assert.equal((await director.get(`/api/projects/${id}`)).json.status, 'on_hold');
  portal.db.prepare('INSERT INTO project_departments (project_id,department_id) VALUES (?,?)').run(id, 'marketing');
  assert.equal((await director.put('/api/departments/finance/projects/old-project-id/status', { status: 'active' })).status, 403);
  assert.equal((await admin.put('/api/departments/tech/projects/old-project-id/status', { status: 'active' })).status, 404);
});

test('client-only management cannot reveal internal details, work, notices, files, meeting links or lead mail', async () => {
  const role = await admin.put('/api/access-roles/client_only', { name: 'Client only', permissions: [] });
  assert.equal(role.status, 200, role.text);
  const email = 'client-only-manager@example.com';
  const person = await admin.post('/api/people', { email, fullName: 'Client manager', departmentId: 'finance' });
  assert.equal(person.status, 201, person.text);
  const actorId = person.json.id;
  const actor = signIn(portal, email);
  const client = await admin.post('/api/projects', { name: 'Visible client work', departmentIds: ['finance'] });
  assert.equal(client.status, 201, client.text);
  const meet = await admin.post('/api/meets', { kind: 'club', title: 'Shared meeting', scheduledAt: '2030-01-01T12:00:00Z' });
  assert.equal(meet.status, 201, meet.text);
  const grant = async (permission, departmentId) => {
    const response = await admin.put(`/api/people/${actorId}/access`, {
      accessRoleId: 'client_only',
      grants: [{ permission, departmentId }, { permission: 'meets.view', departmentId: null }],
    });
    assert.equal(response.status, 200, response.text);
  };
  let last;
  for (const permission of ['projects.manage', 'projects.members.manage', 'projects.tasks.manage']) {
    for (const departmentId of [null, 'finance']) {
      await grant(permission, departmentId);
      const made = await admin.post('/api/projects', { name: `Private ${permission} ${departmentId}`, departmentIds: ['finance'], internal: true });
      assert.equal(made.status, 201, made.text);
      const projectId = made.json.id;
      const taskId = crypto.randomUUID();
      // An old assignment/notice must not preserve access after the person's grants changed.
      portal.db.prepare('INSERT INTO project_tasks (id,project_id,title,assignee_id) VALUES (?,?,?,?)').run(taskId, projectId, 'Private task', actorId);
      portal.db.prepare("INSERT INTO notifications (recipient_id,kind,project_id,task_id,dedupe_key) VALUES (?,'task_assigned',?,?,?)")
        .run(actorId, projectId, taskId, `assigned:${taskId}:1`);
      const file = await admin.upload(`/api/projects/${projectId}/files`, { file: { name: 'private.txt', type: 'text/plain', data: 'Private fixture' } });
      assert.equal(file.status, 201, file.text);
      assert.equal((await admin.post(`/api/meets/${meet.json.id}/action-items`, { projectId, taskId })).status, 201);

      assert.equal((await actor.get(`/api/projects/${client.json.id}`)).status, 200);
      assert.equal((await actor.get(`/api/projects/${projectId}`)).status, 404);
      assert.ok(!(await actor.get('/api/projects')).json.some((project) => project.id === projectId));
      assert.ok(!(await actor.get('/api/today')).json.tasks.some((task) => task.id === taskId));
      assert.deepEqual((await actor.get('/api/notifications')).json.notifications, []);
      assert.equal((await actor.get('/api/notifications/count')).json.unread, 0);
      assert.equal((await actor.get(`/api/projects/${projectId}/files`)).status, 404);
      assert.equal((await actor.get(`/api/projects/${projectId}/files/${file.json.id}/download`)).status, 404);
      assert.equal((await actor.del(`/api/projects/${projectId}/files/${file.json.id}`)).status, 404);
      assert.equal((await actor.put(`/api/projects/${projectId}/tasks/${taskId}/status`, { status: 'completed' })).status, 404);
      const meeting = (await actor.get('/api/meets')).json.find((item) => item.id === meet.json.id);
      assert.deepEqual(meeting.actionItems, []);
      const mail = portal.db.prepare("SELECT recipients FROM email_queue WHERE kind = 'project' AND json_extract(meta, '$.projectId') = ? AND subject LIKE 'New project:%'").get(projectId);
      assert.ok(mail, 'the real department lead is still notified');
      assert.ok(!JSON.parse(mail.recipients).includes(email));
      last = { projectId, taskId, fileId: file.json.id };
    }
  }

  await grant('projects.manage', 'finance');
  const named = await admin.post(`/api/projects/${last.projectId}/members`, { personId: actorId, role: 'Explicit project manager' });
  assert.equal(named.status, 201, named.text);
  assert.equal((await actor.get(`/api/projects/${last.projectId}`)).status, 200);
  assert.ok((await actor.get('/api/today')).json.tasks.some((task) => task.id === last.taskId));
  assert.equal((await actor.get('/api/notifications/count')).json.unread, 1);
  assert.equal((await actor.patch(`/api/projects/${last.projectId}`, { name: 'Explicitly managed internal work', departmentIds: ['finance'] })).status, 200);
  assert.equal((await admin.del(`/api/projects/${last.projectId}/members/${named.json.id}`)).status, 200);
  assert.equal((await actor.get(`/api/projects/${last.projectId}`)).status, 404);

  await grant('departments.workspace.view', 'finance');
  const workspaceRead = await actor.get(`/api/projects/${last.projectId}`);
  assert.deepEqual(workspaceRead.json.access, { view: true, manage: false, manageMembers: false, manageTasks: false });
  assert.equal((await actor.get(`/api/projects/${last.projectId}/files/${last.fileId}/download`)).status, 200);
  await grant('departments.projects.manage', 'finance');
  assert.deepEqual((await actor.get(`/api/projects/${last.projectId}`)).json.access, { view: true, manage: true, manageMembers: true, manageTasks: true });
});
