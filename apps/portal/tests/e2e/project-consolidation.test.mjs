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
  assert.equal((await director.del(`/api/projects/${id}/members/${added.json.id}`)).status, 200);
  assert.ok(!(await member.get('/api/today')).json.tasks.some((item) => item.id === task.json.id));
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
