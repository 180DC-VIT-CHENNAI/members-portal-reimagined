import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
let portal;
let admin;
const clients = {};
const ids = {};

const personId = (email) => portal.db.prepare('SELECT id FROM people WHERE email = ?').get(email).id;
const count = (sql, ...args) => portal.db.prepare(sql).get(...args).n;

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, ADMIN);
  const invite = [
    ['dirA', 'dir.a@example.com', 'tech', 'director'],
    ['dirB', 'dir.b@example.com', 'tech', 'director'],
    ['dirF', 'dir.f@example.com', 'finance', 'director'],
    ['member', 'member.m@example.com', 'tech', 'member'],
    ['successor', 'successor.s@example.com', 'tech', 'member'],
  ];
  for (const [key, email, departmentId, accessRoleId] of invite) {
    const res = await admin.post('/api/people', { email, fullName: key, departmentId, accessRoleId });
    assert.equal(res.status, 201, res.text);
    clients[key] = signIn(portal, email);
    ids[key] = personId(email);
  }
});
after(async () => {
  await portal?.stop();
});

describe('status history', () => {
  test('a lifecycle change records actor, reason and effective date', async () => {
    const res = await admin.post(`/api/people/${ids.successor}/status`, { status: 'on_leave', reason: 'exams', effectiveOn: '2026-09-01' });
    assert.equal(res.status, 200, res.text);
    assert.equal((await admin.post(`/api/people/${ids.successor}/status`, { status: 'active', reason: 'back' })).status, 200);
    const history = await admin.get(`/api/people/${ids.successor}/status`);
    assert.equal(history.status, 200, history.text);
    assert.deepEqual(
      history.json.map((h) => [h.fromStatus, h.toStatus, h.reason]),
      [[null, 'invited', 'invited'], ['active', 'on_leave', 'exams'], ['on_leave', 'active', 'back']],
    );
    assert.equal(history.json[1].effectiveOn, '2026-09-01');
    assert.equal(history.json[1].actorPersonId, personId(ADMIN));
  });

  test('future effective dates are refused and outsiders cannot read the history', async () => {
    assert.equal((await admin.post(`/api/people/${ids.successor}/status`, { status: 'on_leave', effectiveOn: '2999-01-01' })).status, 400);
    assert.equal((await clients.member.get(`/api/people/${ids.successor}/status`)).status, 403);
    assert.equal((await clients.dirF.get(`/api/people/${ids.successor}/status`)).status, 403);
  });
});

describe('secondary department memberships', () => {
  test('a finance director adds a tech member to finance; permissions still follow the primary department', async () => {
    const before = (await clients.member.get('/api/me')).json.permissions;
    const res = await clients.dirF.post(`/api/people/${ids.member}/memberships`, { departmentId: 'finance', note: 'Budget support' });
    assert.equal(res.status, 201, res.text);
    assert.equal((await clients.dirF.post(`/api/people/${ids.member}/memberships`, { departmentId: 'finance' })).status, 409);
    const listed = await admin.get('/api/people?department=finance');
    assert.ok(listed.json.some((p) => p.id === ids.member), 'directory filter includes secondary members');
    const detail = await admin.get(`/api/people/${ids.member}`);
    assert.deepEqual(detail.json.memberships.map((m) => [m.departmentId, m.note, m.validUntil]), [['finance', 'Budget support', null]]);
    assert.deepEqual((await clients.member.get('/api/me')).json.permissions, before);
  });

  test('a director cannot add members to another department, nor to their primary one', async () => {
    assert.equal((await clients.dirA.post(`/api/people/${ids.successor}/memberships`, { departmentId: 'finance' })).status, 403);
    assert.equal((await clients.dirA.post(`/api/people/${ids.successor}/memberships`, { departmentId: 'tech' })).status, 400);
  });
});

describe('promotion workflow', () => {
  const access = (id) => ({
    role: portal.db.prepare('SELECT access_role_id AS r FROM people WHERE id = ?').get(id).r,
    grants: portal.db.prepare('SELECT * FROM person_grants WHERE person_id = ? ORDER BY id').all(id).map((g) => ({ ...g })),
  });

  test('members cannot propose and outsiders cannot see proposals', async () => {
    assert.equal((await clients.member.post('/api/promotions', { personId: ids.successor, positionId: 'pos_tech_director', rationale: 'x' })).status, 403);
    assert.equal((await clients.dirA.post('/api/promotions', { personId: ids.dirA, positionId: 'pos_tech_director', rationale: 'me' })).status, 400);
    assert.equal((await admin.put(`/api/people/${ids.member}/access`, {
      accessRoleId: 'member', grants: [
        { permission: 'people.promotions.approve', departmentId: 'tech' },
        { permission: 'files.manage', departmentId: null },
      ],
    })).status, 200);
    const res = await clients.dirA.post('/api/promotions', { personId: ids.member, positionId: 'pos_tech_director', rationale: 'Led the cloud migration' });
    assert.equal(res.status, 201, res.text);
    ids.proposal = res.json.id;
    assert.equal((await clients.dirF.get(`/api/promotions/${ids.proposal}`)).status, 404);
    assert.equal((await clients.successor.get(`/api/promotions/${ids.proposal}`)).status, 404);
    assert.equal(count('SELECT COUNT(*) AS n FROM tenures WHERE person_id = ?', ids.member), 0, 'nothing changes before approval');
  });

  test('the proposer cannot approve their own proposal', async () => {
    const res = await clients.dirA.post(`/api/promotions/${ids.proposal}/decision`, { action: 'approve' });
    assert.equal(res.status, 403, res.text);
  });

  test('the person being promoted cannot approve their own promotion', async () => {
    const res = await clients.member.post(`/api/promotions/${ids.proposal}/decision`, { action: 'approve' });
    assert.equal(res.status, 403, res.text);
  });

  test('a director of another department cannot decide it', async () => {
    assert.equal((await clients.dirF.post(`/api/promotions/${ids.proposal}/decision`, { action: 'approve' })).status, 404);
  });

  test('approval by another director creates the tenure and leaves access unchanged', async () => {
    const granted = await admin.put(`/api/people/${ids.member}/access`, { accessRoleId: 'member', grants: [{ permission: 'files.manage', departmentId: null }] });
    assert.equal(granted.status, 200, granted.text);
    const accessBefore = access(ids.member);
    assert.equal(accessBefore.grants.length, 1);
    const permissionsBefore = (await clients.member.get('/api/me')).json.permissions;
    const res = await clients.dirB.post(`/api/promotions/${ids.proposal}/decision`, { action: 'approve', note: 'Agreed' });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.status, 'approved');
    const tenure = portal.db.prepare('SELECT * FROM tenures WHERE id = ?').get(res.json.tenureId);
    assert.equal(tenure.person_id, ids.member);
    assert.equal(tenure.position_id, 'pos_tech_director');
    assert.deepEqual(access(ids.member), accessBefore);
    assert.deepEqual((await clients.member.get('/api/me')).json.permissions, permissionsBefore);
    const review = portal.db.prepare("SELECT * FROM access_reviews WHERE source_type = 'promotion' AND source_id = ?").get(ids.proposal);
    assert.equal(review.status, 'open');
    assert.match(review.note, /Access is unchanged/);
    assert.equal((await clients.dirB.post(`/api/promotions/${ids.proposal}/decision`, { action: 'approve' })).status, 409);
  });

  test('the promotion notice goes through the email queue to the person only', async () => {
    const campaign = portal.db.prepare("SELECT * FROM email_queue WHERE kind = 'promotion'").get();
    assert.deepEqual(JSON.parse(campaign.recipients), ['member.m@example.com']);
    for (let run = 0; run < 15 && portal.db.prepare('SELECT status FROM email_queue WHERE id = ?').get(campaign.id).status !== 'done'; run++) {
      await portal.runCron();
    }
    const message = portal.db.prepare('SELECT * FROM dev_outbox WHERE recipient = ? AND subject LIKE ?').get('member.m@example.com', '%new position%');
    assert.ok(message, 'captured');
    assert.match(message.html, /Director/);
    assert.match(message.html, /access has not changed/);
  });

  test('access reviews are for people.grants holders, and nobody closes their own', async () => {
    assert.equal((await clients.dirB.get('/api/access-reviews')).status, 403);
    const list = await admin.get('/api/access-reviews?status=open');
    assert.equal(list.status, 200);
    const review = list.json.find((r) => r.sourceId === ids.proposal);
    assert.equal((await admin.post(`/api/access-reviews/${review.id}/review`)).status, 200);
    assert.equal((await admin.post(`/api/access-reviews/${review.id}/review`)).status, 400);
  });
});

describe('reports-to and org chart', () => {
  test('reports-to is set per tenure, cycles are refused, and the chart shows it', async () => {
    const memberTenure = portal.db.prepare('SELECT id FROM tenures WHERE person_id = ?').get(ids.member).id;
    const created = await admin.post(`/api/people/${ids.dirA}/tenures`, { positionId: 'pos_tech_director' });
    assert.equal(created.status, 201, created.text);
    assert.equal((await clients.dirA.patch(`/api/tenures/${memberTenure}`, { reportsToPersonId: ids.dirA })).status, 200);
    assert.equal((await clients.dirA.patch(`/api/tenures/${created.json.id}`, { reportsToPersonId: ids.member })).status, 400);
    assert.equal((await clients.dirF.patch(`/api/tenures/${memberTenure}`, { reportsToPersonId: null })).status, 403);
    const chart = await clients.member.get('/api/org-chart');
    assert.equal(chart.status, 200, chart.text);
    assert.equal(chart.json.term.isCurrent, true);
    assert.equal(chart.json.nodes.find((n) => n.personId === ids.member).reportsToPersonId, ids.dirA);
  });
});

describe('offboarding', () => {
  before(async () => {
    const db = portal.db;
    db.prepare("INSERT INTO projects (id, name, status) VALUES ('proj_off', 'Offboarding project', 'active')").run();
    db.prepare("INSERT INTO project_departments (project_id, department_id) VALUES ('proj_off', 'tech')").run();
    db.prepare("INSERT INTO project_members (id, project_id, person_id, role) VALUES ('pm_off', 'proj_off', ?, 'Lead')").run(ids.member);
    db.prepare("INSERT INTO project_tasks (id, project_id, title, assignee_id, status) VALUES ('task_open', 'proj_off', 'Open', ?, 'pending'), ('task_blocked', 'proj_off', 'Blocked', ?, 'blocked'), ('task_done', 'proj_off', 'Done', ?, 'completed')").run(ids.member, ids.member, ids.member);
    db.prepare("INSERT INTO crm_stages (id, label, kind) VALUES ('stage_off', 'Lead', 'open') ON CONFLICT DO NOTHING").run();
    db.prepare("INSERT INTO crm_organizations (id, name, owner_id) VALUES ('org_owned', 'Owned org', ?), ('org_merged', 'Merged org', ?), ('org_shared', 'Shared org', NULL)").run(ids.member, ids.member);
    db.prepare("UPDATE crm_organizations SET merged_into_id = 'org_owned' WHERE id = 'org_merged'").run();
    db.prepare("INSERT INTO crm_opportunities (id, organization_id, title, owner_id, stage_id) VALUES ('opp_owned', 'org_owned', 'Owned deal', ?, 'stage_off'), ('opp_shared', 'org_shared', 'Shared deal', NULL, 'stage_off')").run(ids.member);
    db.prepare("INSERT INTO crm_proposals (id, opportunity_id, title) VALUES ('prop_off', 'opp_owned', 'Proposal')").run();
    db.prepare("INSERT INTO crm_engagements (id, opportunity_id, proposal_id, lead_id) VALUES ('eng_off', 'opp_owned', 'prop_off', ?)").run(ids.member);
    db.prepare("INSERT INTO crm_record_access (id, record_type, record_id, person_id, role) VALUES ('acc_collab', 'organization', 'org_shared', ?, 'collaborator'), ('acc_owner', 'opportunity', 'opp_shared', ?, 'owner')").run(ids.member, ids.member);
    const grant = await admin.put(`/api/people/${ids.member}/access`, { accessRoleId: 'member', grants: [{ permission: 'files.manage', departmentId: null }] });
    assert.equal(grant.status, 200, grant.text);
  });

  test('a member without people.offboard is refused', async () => {
    assert.equal((await clients.successor.post(`/api/people/${ids.member}/offboard`, { status: 'alumni', reason: 'x' })).status, 403);
    assert.equal((await clients.dirF.post(`/api/people/${ids.member}/offboard`, { status: 'alumni', reason: 'x' })).status, 403);
    assert.equal((await clients.successor.get(`/api/people/${ids.member}/offboard`)).status, 403);
  });

  test('owned work needs a successor', async () => {
    const preview = await clients.dirA.get(`/api/people/${ids.member}/offboard`);
    assert.equal(preview.status, 200, preview.text);
    assert.equal(preview.json.needsSuccessor, true);
    assert.equal(preview.json.steps.find((s) => s.key === 'tasks').count, 2);
    assert.deepEqual(preview.json.steps.find((s) => s.key === 'tasks').items.map((i) => i.id).sort(), ['task_blocked', 'task_open']);
    assert.equal(preview.json.steps.find((s) => s.key === 'projects').items[0].id, 'proj_off');
    assert.equal(preview.json.steps.find((s) => s.key === 'crm').count, 5, 'owned org, opportunity, engagement lead and two grants; merged org excluded');
    const res = await clients.dirA.post(`/api/people/${ids.member}/offboard`, { status: 'alumni', reason: 'Graduated' });
    assert.equal(res.status, 400);
    assert.equal(count("SELECT COUNT(*) AS n FROM people WHERE id = ? AND status = 'active'", ids.member), 1, 'nothing changed');
  });

  test('offboarding reassigns work, ends tenures, removes grants and sessions in one step', async () => {
    assert.equal((await clients.member.get('/api/me')).status, 200);
    const res = await clients.dirA.post(`/api/people/${ids.member}/offboard`, {
      status: 'alumni', successorId: ids.successor, reason: 'Graduated', handover: [{ item: 'Shared drive handed over', done: true }],
    });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.changed, true);
    assert.deepEqual({ tasks: res.json.summary.tasks, projects: res.json.summary.projects, tenures: res.json.summary.tenures, grants: res.json.summary.grants }, { tasks: 2, projects: 1, tenures: 1, grants: 1 });
    assert.ok(res.json.summary.sessions >= 1);
    const assignee = (taskId) => portal.db.prepare('SELECT assignee_id AS a FROM project_tasks WHERE id = ?').get(taskId).a;
    assert.equal(assignee('task_open'), ids.successor);
    assert.equal(assignee('task_blocked'), ids.successor);
    assert.equal(assignee('task_done'), ids.member, 'completed work keeps its author');
    assert.equal(portal.db.prepare("SELECT role FROM project_members WHERE project_id = 'proj_off' AND person_id = ?").get(ids.successor).role, 'Lead');
    assert.equal(count('SELECT COUNT(*) AS n FROM project_members WHERE person_id = ?', ids.member), 0);
    assert.equal(count('SELECT COUNT(*) AS n FROM person_grants WHERE person_id = ?', ids.member), 0);
    assert.equal(count('SELECT COUNT(*) AS n FROM tenures WHERE person_id = ? AND ended_on IS NULL', ids.member), 0);
    assert.equal(count("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'task.update' AND target_id = 'task_open'"), 1, 'task history records the reassignment');
    assert.equal(res.json.summary.crm, 5);
    const owner = (table, id) => portal.db.prepare(`SELECT owner_id AS o FROM ${table} WHERE id = ?`).get(id).o;
    assert.equal(owner('crm_organizations', 'org_owned'), ids.successor);
    assert.equal(owner('crm_organizations', 'org_merged'), ids.member, 'merged records keep their historical owner');
    assert.equal(owner('crm_opportunities', 'opp_owned'), ids.successor);
    assert.equal(portal.db.prepare("SELECT lead_id AS l FROM crm_engagements WHERE id = 'eng_off'").get().l, ids.successor);
    assert.equal(count('SELECT COUNT(*) AS n FROM crm_record_access WHERE person_id = ?', ids.member), 0);
    assert.deepEqual(
      portal.db.prepare('SELECT record_id AS r, role FROM crm_record_access WHERE person_id = ?').all(ids.successor).map((g) => ({ ...g })),
      [{ r: 'opp_shared', role: 'owner' }],
      'owner grants move to the successor; collaborator grants do not',
    );
    assert.equal(count("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('crm.owner.reassign', 'crm.engagement.reassign', 'crm.grant.remove')"), 5);
    assert.equal((await clients.member.get('/api/me')).status, 401);
    const history = await admin.get(`/api/people/${ids.member}/status`);
    assert.deepEqual(history.json.at(-1).toStatus, 'alumni');
    const record = (await clients.dirA.get(`/api/people/${ids.member}/offboard`)).json.records[0];
    assert.ok(record.checklist.some((c) => c.item === 'Shared drive handed over'));
  });

  test('offboarding again is a no-op', async () => {
    const res = await clients.dirA.post(`/api/people/${ids.member}/offboard`, { status: 'alumni', successorId: ids.successor, reason: 'Graduated' });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.changed, false);
    assert.ok(Object.values(res.json.summary).every((n) => n === 0));
    assert.equal(count('SELECT COUNT(*) AS n FROM offboarding_records WHERE person_id = ?', ids.member), 1);
    assert.equal(count("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'task.update' AND target_id = 'task_open'"), 1);
    assert.equal(count("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('crm.owner.reassign', 'crm.engagement.reassign', 'crm.grant.remove')"), 5);
  });
});

describe('non-self-escalation on access', () => {
  test('nobody changes their own access role or grants', async () => {
    const res = await admin.put(`/api/people/${personId(ADMIN)}/access`, { accessRoleId: 'admin', grants: [] });
    assert.equal(res.status, 400);
    assert.match(res.text, /cannot_change_own_access/);
  });

  test('directors without people.grants cannot change anyone\'s access, including to escalate themselves', async () => {
    assert.equal((await clients.dirA.put(`/api/people/${ids.dirA}/access`, { accessRoleId: 'admin', grants: [] })).status, 403);
    assert.equal((await clients.dirA.put(`/api/people/${ids.successor}/access`, { accessRoleId: 'admin', grants: [] })).status, 403);
    assert.equal(portal.db.prepare('SELECT access_role_id AS r FROM people WHERE id = ?').get(ids.dirA).r, 'director');
  });
});

describe('onboarding policies', () => {
  test('admins add a policy that members must acknowledge', async () => {
    assert.equal((await clients.dirA.post('/api/onboarding/policies', { title: 'Code of conduct' })).status, 403);
    assert.equal((await admin.post('/api/onboarding/policies', { title: 'Bad link', href: 'javascript:alert(1)' })).status, 400);
    const created = await admin.post('/api/onboarding/policies', { title: 'Code of conduct', description: 'How we work', href: '/files' });
    assert.equal(created.status, 201, created.text);
    const key = `policy:${created.json.id}`;
    // Hiding the checklist does not hide an unacknowledged policy.
    await clients.successor.post('/api/onboarding/acknowledgments', { item: 'checklist_dismissed' });
    const checklist = await clients.successor.get('/api/onboarding');
    assert.equal(checklist.json.visible, true);
    assert.ok(checklist.json.items.some((i) => i.key === key && !i.done));
    const acknowledged = await clients.successor.post('/api/onboarding/acknowledgments', { item: key });
    assert.equal(acknowledged.status, 200, acknowledged.text);
    assert.ok(acknowledged.json.items.find((i) => i.key === key).done);
    assert.equal((await clients.successor.post('/api/onboarding/acknowledgments', { item: 'policy:nope' })).status, 400);
    assert.equal((await admin.patch(`/api/onboarding/policies/${created.json.id}`, { active: false })).status, 200);
    assert.ok(!(await clients.dirB.get('/api/onboarding')).json.items.some((i) => i.key === key), 'retired policies leave the checklist');
  });
});

describe('board handover checklist', () => {
  test('terms.manage builds the list; owners see and tick only their items', async () => {
    assert.equal((await clients.dirA.post('/api/terms/2026-27/handover', { title: 'Bank signatories' })).status, 403);
    const item = await admin.post('/api/terms/2026-27/handover', { title: 'Bank signatories', ownerPersonId: ids.dirB });
    assert.equal(item.status, 201, item.text);
    await admin.post('/api/terms/2026-27/handover', { title: 'Domain registrar', ownerPersonId: null });
    assert.equal((await admin.get('/api/terms/2026-27/handover')).json.items.length, 2);
    assert.deepEqual((await clients.dirB.get('/api/terms/2026-27/handover')).json.items.map((i) => i.title), ['Bank signatories']);
    assert.equal((await clients.dirA.patch(`/api/handover-items/${item.json.id}`, { done: true })).status, 404);
    assert.equal((await clients.dirB.patch(`/api/handover-items/${item.json.id}`, { title: 'Renamed' })).status, 403);
    const ticked = await clients.dirB.patch(`/api/handover-items/${item.json.id}`, { done: true });
    assert.equal(ticked.status, 200, ticked.text);
    assert.equal(ticked.json.done, true);
  });
});
