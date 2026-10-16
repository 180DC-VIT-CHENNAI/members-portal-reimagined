import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
let portal;
let admin;
let director; // finance director (department-scoped grants)
let member; // finance member
let advisory; // finance advisory
let outsider; // marketing member
let directorId;

async function invite(email, fullName, departmentId, positionId, accessRoleId) {
  const res = await admin.post('/api/people', { email, fullName, departmentId, positionId, ...(accessRoleId ? { accessRoleId } : {}) });
  assert.equal(res.status, 201, res.text);
  return res.json.id;
}

before(async () => {
  portal = await startPortal();
  admin = signIn(portal, ADMIN);
  directorId = await invite('dir.finance@example.com', 'Dana Director', 'finance', 'pos_finance_director', 'director');
  await invite('mem.finance@example.com', 'Milo Member', 'finance', 'pos_finance_member');
  await invite('adv.finance@example.com', 'Ada Advisory', 'finance', 'pos_advisory', 'advisory');
  await invite('mem.marketing@example.com', 'Maya Marketing', 'marketing', 'pos_marketing_member');
  await invite('pending.finance@example.com', 'Pat Pending', 'finance', 'pos_finance_member');
  director = signIn(portal, 'dir.finance@example.com');
  member = signIn(portal, 'mem.finance@example.com');
  advisory = signIn(portal, 'adv.finance@example.com');
  outsider = signIn(portal, 'mem.marketing@example.com');
});
after(async () => {
  await portal?.stop();
});

describe('department catalogue', () => {
  test('is public, alphabetical and carries descriptions', async () => {
    const res = await anonymous(portal).get('/api/departments');
    assert.equal(res.status, 200, res.text);
    const names = res.json.map((d) => d.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
    const tech = res.json.find((d) => d.id === 'tech');
    assert.equal(tech.description, 'Handles technical infrastructure, UI, and research & development');
    assert.equal(tech.active, true);
  });
});

describe('department workspace', () => {
  test('every workspace route needs a session', async () => {
    const anon = anonymous(portal);
    for (const path of ['/api/departments/finance/overview', '/api/departments/finance/members', '/api/departments/finance/instructions']) {
      assert.equal((await anon.get(path)).status, 401, path);
    }
    assert.equal((await anon.post('/api/departments/finance/instructions', { title: 't', content: 'c' })).status, 401);
  });

  test('members list: home department, people with access, current positions', async () => {
    const res = await member.get('/api/departments/finance/members');
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.json.map((p) => p.fullName), ['Ada Advisory', 'Dana Director', 'Milo Member']);
    const dana = res.json.find((p) => p.id === directorId);
    assert.deepEqual(dana.positions.map((p) => p.title), ['Director']);
    assert.equal(dana.email, 'dir.finance@example.com');
    // Invited (never signed in) and other departments are excluded; leaving takes effect at once.
    assert.equal((await admin.post(`/api/people/${directorId}/status`, { status: 'on_leave' })).status, 200);
    assert.ok((await advisory.get('/api/departments/finance/members')).json.some((p) => p.id === directorId), 'on leave keeps access');
    assert.equal((await admin.post(`/api/people/${directorId}/status`, { status: 'active' })).status, 200);
    assert.equal((await outsider.get('/api/departments/finance/members')).status, 403);
    assert.equal((await admin.get('/api/departments/finance/members')).status, 200);
    assert.equal((await admin.get('/api/departments/nope/members')).status, 404);
  });

  test('instructions: directors manage their department, members read', async () => {
    const created = await director.post('/api/departments/finance/instructions', { title: '  Submit receipts ', content: 'By Friday', priority: 'urgent' });
    assert.equal(created.status, 201, created.text);
    const plain = await director.post('/api/departments/finance/instructions', { title: 'Weekly sync', content: 'Mondays' });
    assert.equal(plain.status, 201, plain.text);

    const list = await member.get('/api/departments/finance/instructions');
    assert.equal(list.status, 200, list.text);
    const urgent = list.json.find((i) => i.id === created.json.id);
    assert.equal(urgent.title, 'Submit receipts');
    assert.equal(urgent.priority, 'urgent');
    assert.equal(urgent.authorName, 'Dana Director');
    assert.equal(list.json.find((i) => i.id === plain.json.id).priority, 'medium');
    assert.equal((await advisory.get('/api/departments/finance/instructions')).status, 200);
    assert.equal((await outsider.get('/api/departments/finance/instructions')).status, 403);

    assert.equal((await member.post('/api/departments/finance/instructions', { title: 'x', content: 'y' })).status, 403);
    assert.equal((await director.post('/api/departments/marketing/instructions', { title: 'x', content: 'y' })).status, 403);
    assert.equal((await director.post('/api/departments/finance/instructions', { title: 'x', content: 'y', priority: 'whenever' })).status, 400);
    assert.equal((await director.post('/api/departments/finance/instructions', { title: ' ', content: 'y' })).status, 400);
    assert.equal((await director.post('/api/departments/finance/instructions', { title: 'x'.repeat(256), content: 'y' })).status, 400);

    // A finance director cannot delete through another department's path.
    assert.equal((await director.del(`/api/departments/marketing/instructions/${plain.json.id}`)).status, 403);
    assert.equal((await admin.del(`/api/departments/marketing/instructions/${plain.json.id}`)).status, 404);
    assert.equal((await member.del(`/api/departments/finance/instructions/${plain.json.id}`)).status, 403);
    assert.equal((await director.del(`/api/departments/finance/instructions/${plain.json.id}`)).status, 204);
    assert.equal((await director.del(`/api/departments/finance/instructions/${plain.json.id}`)).status, 404);
  });

  test('documents and projects round trip through the overview', async () => {
    const doc = await director.post('/api/departments/finance/documents', { title: 'Budget 2026', description: '', fileUrl: 'https://example.com/budget.pdf' });
    assert.equal(doc.status, 201, doc.text);
    const bare = await director.post('/api/departments/finance/documents', { title: 'Notes' });
    assert.equal(bare.status, 201, bare.text);
    assert.equal((await director.post('/api/departments/finance/documents', { title: 'Bad', fileUrl: 'javascript:alert(1)' })).status, 400);
    assert.equal((await director.post('/api/departments/finance/documents', { title: 'Bad', fileUrl: 'ftp://example.com/x' })).status, 400);

    const project = await director.post('/api/departments/finance/projects', { name: 'Audit prep', deadline: '2026-12-01' });
    assert.equal(project.status, 201, project.text);
    assert.equal((await director.post('/api/departments/finance/projects', { name: 'Late', deadline: 'soon' })).status, 400);
    const status = await director.put(`/api/departments/finance/projects/${project.json.id}/status`, { status: 'active' });
    assert.equal(status.status, 200, status.text);
    assert.deepEqual(status.json, { id: project.json.id, status: 'active' });
    assert.equal((await director.put(`/api/departments/finance/projects/${project.json.id}/status`, { status: 'done-ish' })).status, 400);
    assert.equal((await director.put(`/api/departments/finance/projects/${project.json.id}/status`, {})).status, 400);
    assert.equal((await admin.put(`/api/departments/marketing/projects/${project.json.id}/status`, { status: 'completed' })).status, 404);

    const overview = await director.get('/api/departments/finance/overview');
    assert.equal(overview.status, 200, overview.text);
    assert.equal(overview.json.department.id, 'finance');
    const budget = overview.json.documents.find((d) => d.id === doc.json.id);
    assert.equal(budget.fileUrl, 'https://example.com/budget.pdf');
    assert.equal(budget.description, null);
    assert.equal(budget.status, 'pending');
    assert.equal(overview.json.documents.find((d) => d.id === bare.json.id).fileUrl, null);
    const audit = overview.json.projects.find((p) => p.id === project.json.id);
    assert.equal(audit.status, 'active');
    assert.equal(audit.deadline, '2026-12-01');
    assert.ok(overview.json.instructions.length >= 1);
    // Other departments' workspaces stay separate.
    const marketing = await admin.get('/api/departments/marketing/overview');
    assert.deepEqual([marketing.json.documents, marketing.json.projects], [[], []]);

    assert.equal((await member.get('/api/departments/finance/overview')).status, 403);
    assert.equal((await advisory.get('/api/departments/finance/overview')).status, 403);
    assert.equal((await director.get('/api/departments/marketing/overview')).status, 403);
    assert.equal((await member.post('/api/departments/finance/documents', { title: 'x' })).status, 403);
    assert.equal((await member.post('/api/departments/finance/projects', { name: 'x' })).status, 403);

    assert.equal((await director.del(`/api/departments/finance/documents/${doc.json.id}`)).status, 204);
    assert.equal((await director.del(`/api/departments/finance/documents/${doc.json.id}`)).status, 404);
    const actions = portal.db
      .prepare("SELECT action FROM audit_log WHERE target_type IN ('department_document', 'department_project') ORDER BY created_at, rowid")
      .all()
      .map((r) => r.action);
    assert.deepEqual(actions, ['department_document.create', 'department_document.create', 'department_project.create', 'department_project.status', 'department_document.delete']);
  });

  test('a scoped individual grant opens one department only; deactivation ends access', async () => {
    const memberId = portal.db.prepare("SELECT id FROM people WHERE email = 'mem.marketing@example.com'").get().id;
    const grant = await admin.put(`/api/people/${memberId}/access`, {
      accessRoleId: 'member',
      grants: [{ permission: 'departments.workspace.view', departmentId: 'finance' }],
    });
    assert.equal(grant.status, 200, grant.text);
    assert.equal((await outsider.get('/api/departments/finance/overview')).status, 200);
    assert.equal((await outsider.get('/api/departments/operations/overview')).status, 403);

    assert.equal((await admin.post(`/api/people/${directorId}/status`, { status: 'alumni' })).status, 200);
    assert.equal((await director.get('/api/departments/finance/overview')).status, 401);
    assert.ok(!(await member.get('/api/departments/finance/members')).json.some((p) => p.id === directorId), 'alumni leave the member list');
  });
});
