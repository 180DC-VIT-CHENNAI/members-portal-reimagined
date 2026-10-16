import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
let portal;
let admin;

before(async () => {
  portal = await startPortal();
  admin = signIn(portal, ADMIN);
});
after(async () => {
  await portal?.stop();
});

const personId = (email) => portal.db.prepare('SELECT id FROM people WHERE email = ?').get(email)?.id;

describe('sign-in and identity', () => {
  test('signed-out requests get 401', async () => {
    assert.equal((await anonymous(portal).get('/api/me')).status, 401);
    assert.equal((await anonymous(portal).get('/api/people')).status, 401);
  });

  test('the seeded admin activates on first sign-in with every permission', async () => {
    const me = await admin.get('/api/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.person.status, 'active');
    assert.equal(me.json.person.accessRoleId, 'admin');
    assert.equal(me.json.permissions['people.grants'], 'global');
    assert.equal(Object.keys(me.json.permissions).length, 12);
  });

  test('a Better Auth user with no person record has no access', async () => {
    const stranger = signIn(portal, 'stranger@example.com');
    assert.equal((await stranger.get('/api/me')).status, 401);
  });
});

describe('inviting people', () => {
  test('admin invites a tech director and a finance member', async () => {
    const d = await admin.post('/api/people', { email: ' Dir.Tech@Example.com ', fullName: 'Tech Director', departmentId: 'tech', accessRoleId: 'director', positionId: 'pos_tech_director' });
    assert.equal(d.status, 201, d.text);
    assert.equal(d.json.status, 'invited');
    const m = await admin.post('/api/people', { email: 'fin.member@example.com', fullName: 'Fin Member', departmentId: 'finance' });
    assert.equal(m.status, 201, m.text);
    assert.ok(personId('dir.tech@example.com'), 'email is normalised');
  });

  test('duplicate email is a conflict and bad input is rejected', async () => {
    assert.equal((await admin.post('/api/people', { email: 'fin.member@example.com', fullName: 'Again' })).status, 409);
    assert.equal((await admin.post('/api/people', { email: 'not-an-email', fullName: 'X' })).status, 400);
    assert.equal((await admin.post('/api/people', { email: 'x@example.com', fullName: 'X', departmentId: 'nope' })).status, 400);
  });

  test('directors invite only into their own department and only as members', async () => {
    const director = signIn(portal, 'dir.tech@example.com');
    assert.equal((await director.post('/api/people', { email: 'tech.member@example.com', fullName: 'Tech Member', departmentId: 'tech' })).status, 201);
    assert.equal((await director.post('/api/people', { email: 'x1@example.com', fullName: 'X', departmentId: 'finance' })).status, 403);
    assert.equal((await director.post('/api/people', { email: 'x2@example.com', fullName: 'X', departmentId: 'tech', accessRoleId: 'admin' })).status, 400);
  });

  test('members cannot invite', async () => {
    const member = signIn(portal, 'fin.member@example.com');
    assert.equal((await member.post('/api/people', { email: 'x3@example.com', fullName: 'X', departmentId: 'finance' })).status, 403);
  });
});

describe('profiles and directory', () => {
  test('members edit their own profile with validated fields', async () => {
    const member = signIn(portal, 'fin.member@example.com');
    const id = personId('fin.member@example.com');
    const ok = await member.patch(`/api/people/${id}`, {
      phone: '+91 98765 43210', regNo: '23BCE1234', year: 3, branch: 'CSE',
      linkedinUrl: 'https://www.linkedin.com/in/fin', githubUrl: 'https://github.com/fin', skills: ['excel', 'valuation'], bio: 'Hi',
    });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.json.phone, '+91 98765 43210');
    assert.equal((await member.patch(`/api/people/${id}`, { githubUrl: 'https://evil.example.com/x' })).status, 400);
    assert.equal((await member.patch(`/api/people/${id}`, { linkedinUrl: 'javascript:alert(1)' })).status, 400);
    assert.equal((await member.patch(`/api/people/${id}`, { year: 9 })).status, 400);
  });

  test('members cannot edit others or move departments', async () => {
    const member = signIn(portal, 'fin.member@example.com');
    assert.equal((await member.patch(`/api/people/${personId(ADMIN)}`, { bio: 'x' })).status, 403);
    assert.equal((await member.patch(`/api/people/${personId('fin.member@example.com')}`, { departmentId: 'tech' })).status, 403);
  });

  test('private fields are visible only to self and view_private holders', async () => {
    const id = personId('fin.member@example.com');
    const techMember = signIn(portal, 'tech.member@example.com');
    const director = signIn(portal, 'dir.tech@example.com');
    assert.equal((await techMember.get(`/api/people/${id}`)).json.phone, null);
    assert.equal((await director.get(`/api/people/${id}`)).json.phone, null, 'tech director cannot see finance private fields');
    assert.equal((await admin.get(`/api/people/${id}`)).json.phone, '+91 98765 43210');
    assert.equal((await admin.get(`/api/people/${id}`)).json.authUserId, undefined, 'auth ids never leave the server');
  });

  test('directory search and filters', async () => {
    const byName = await admin.get('/api/people?q=Fin');
    assert.deepEqual(byName.json.map((p) => p.email), ['fin.member@example.com']);
    const bySkill = await admin.get('/api/people?q=valuation');
    assert.equal(bySkill.json.length, 1);
    const tech = await admin.get('/api/people?department=tech');
    assert.deepEqual(tech.json.map((p) => p.email).sort(), ['dir.tech@example.com', 'srijan.guchhait@gmail.com', 'tech.member@example.com']);
    const directors = await admin.get('/api/people?position=pos_tech_director');
    assert.deepEqual(directors.json.map((p) => p.email), ['dir.tech@example.com']);
    assert.equal(directors.json[0].positions[0].title, 'Director');
    assert.equal((await admin.get('/api/people?status=bogus')).status, 400);
  });
});

describe('lifecycle', () => {
  test('moving someone to alumni ends their access immediately', async () => {
    const member = signIn(portal, 'fin.member@example.com');
    assert.equal((await member.get('/api/me')).status, 200);
    const id = personId('fin.member@example.com');
    const res = await admin.post(`/api/people/${id}/status`, { status: 'alumni', note: 'graduated' });
    assert.equal(res.status, 200, res.text);
    assert.equal((await member.get('/api/me')).status, 401);
    const userId = portal.db.prepare('SELECT auth_user_id AS u FROM people WHERE id = ?').get(id).u;
    assert.equal(portal.db.prepare('SELECT COUNT(*) AS n FROM session WHERE userId = ?').get(userId).n, 0, 'sessions revoked');
    assert.ok(portal.db.prepare('SELECT id FROM people WHERE id = ?').get(id), 'record kept');
  });

  test('reinstating restores access; on_leave keeps access', async () => {
    const id = personId('fin.member@example.com');
    assert.equal((await admin.post(`/api/people/${id}/status`, { status: 'active' })).json.status, 'active');
    assert.equal((await admin.post(`/api/people/${id}/status`, { status: 'on_leave' })).status, 200);
    assert.equal((await signIn(portal, 'fin.member@example.com').get('/api/me')).status, 200);
    assert.equal((await admin.post(`/api/people/${id}/status`, { status: 'active' })).status, 200);
  });

  test('invalid transitions and self-changes are rejected', async () => {
    const invited = await admin.post('/api/people', { email: 'never@example.com', fullName: 'Never Signed In', departmentId: 'crm' });
    assert.equal((await admin.post(`/api/people/${invited.json.id}/status`, { status: 'active' })).status, 400);
    assert.equal((await admin.post(`/api/people/${invited.json.id}/status`, { status: 'removed' })).json.status, 'removed');
    assert.equal((await admin.post(`/api/people/${invited.json.id}/status`, { status: 'active' })).json.status, 'invited');
    assert.equal((await admin.post(`/api/people/${personId(ADMIN)}/status`, { status: 'alumni' })).status, 400);
  });

  test('directors manage lifecycle only in their department', async () => {
    const director = signIn(portal, 'dir.tech@example.com');
    assert.equal((await director.post(`/api/people/${personId('fin.member@example.com')}/status`, { status: 'on_leave' })).status, 403);
    assert.equal((await director.post(`/api/people/${personId('tech.member@example.com')}/status`, { status: 'on_leave' })).status, 200);
  });
});

describe('positions, tenures and terms', () => {
  test('positions are scoped to the manager department', async () => {
    const director = signIn(portal, 'dir.tech@example.com');
    const created = await director.post('/api/positions', { title: 'Cloud Engineer', departmentId: 'tech', rank: 70 });
    assert.equal(created.status, 201, created.text);
    assert.equal((await director.post('/api/positions', { title: 'Cloud Engineer', departmentId: 'tech' })).status, 409);
    assert.equal((await director.post('/api/positions', { title: 'Analyst', departmentId: 'finance' })).status, 403);
    assert.equal((await director.post('/api/positions', { title: 'Patron', departmentId: null })).status, 403);
    const renamed = await director.patch(`/api/positions/${created.json.id}`, { title: 'Cloud & DevOps Engineer' });
    assert.equal(renamed.json.title, 'Cloud & DevOps Engineer');
  });

  test('tenure history: add and end a position', async () => {
    const id = personId('tech.member@example.com');
    const add = await admin.post(`/api/people/${id}/tenures`, { positionId: 'pos_tech_member', startedOn: '2026-08-01' });
    assert.equal(add.status, 201, add.text);
    assert.equal((await admin.post(`/api/people/${id}/tenures`, { positionId: 'pos_tech_member' })).status, 409);
    assert.equal((await admin.post(`/api/tenures/${add.json.id}/end`, { endedOn: '2026-07-01' })).status, 400);
    assert.equal((await admin.post(`/api/tenures/${add.json.id}/end`, { endedOn: '2026-09-30' })).status, 200);
    const person = await admin.get(`/api/people/${id}`);
    assert.equal(person.json.tenures[0].endedOn, '2026-09-30');
  });

  test('starting a new term ends old tenures, carries over chosen people and graduates alumni', async () => {
    assert.equal((await admin.post('/api/terms', { id: '2027-28', startsOn: '2027-07-01', endsOn: '2027-06-30' })).status, 400);
    assert.equal((await admin.post('/api/terms', { id: '2027-28', startsOn: '2027-07-01', endsOn: '2028-06-30' })).status, 201);
    const director = signIn(portal, 'dir.tech@example.com');
    assert.equal((await director.post('/api/terms/2027-28/start', {})).status, 403);

    const start = await admin.post('/api/terms/2027-28/start', {
      carryOver: [personId(ADMIN)],
      alumni: [personId('dir.tech@example.com')],
    });
    assert.equal(start.status, 200, start.text);
    assert.equal(start.json.previous, '2026-27');
    assert.equal(start.json.carriedOver, 1);
    assert.equal((await director.get('/api/me')).status, 401, 'graduated director loses access');

    const terms = await admin.get('/api/terms');
    assert.equal(terms.json.find((t) => t.isCurrent).id, '2027-28');
    const srijan = await admin.get(`/api/people/${personId(ADMIN)}`);
    const titles = srijan.json.tenures.map((t) => `${t.termId}:${t.title}:${t.endedOn ?? 'open'}`);
    assert.ok(titles.includes('2027-28:Technical Lead - DevOps & Cloud:open'), titles.join(', '));
    assert.ok(titles.includes('2026-27:Technical Lead - DevOps & Cloud:2027-06-30'), titles.join(', '));
    assert.equal((await admin.post('/api/terms/2027-28/start', {})).status, 400);
  });
});

describe('access control', () => {
  test('individual department-scoped grants extend a member', async () => {
    const member = signIn(portal, 'fin.member@example.com');
    assert.equal((await member.get('/api/exports/people')).status, 403);
    const put = await admin.put(`/api/people/${personId('fin.member@example.com')}/access`, {
      accessRoleId: 'member',
      grants: [{ permission: 'people.export', departmentId: 'finance' }],
    });
    assert.equal(put.status, 200, put.text);
    const csv = await member.get('/api/exports/people');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    const lines = csv.text.trim().split('\r\n');
    assert.equal(lines[0].split(',')[0], 'email');
    assert.deepEqual(lines.slice(1).map((l) => l.split(',')[0]), ['fin.member@example.com']);
  });

  test('grants validate permissions and nobody edits their own access', async () => {
    const id = personId('fin.member@example.com');
    assert.equal((await admin.put(`/api/people/${id}/access`, { accessRoleId: 'member', grants: [{ permission: 'nuke.all', departmentId: null }] })).status, 400);
    assert.equal((await admin.put(`/api/people/${personId(ADMIN)}/access`, { accessRoleId: 'member', grants: [] })).status, 400);
  });

  test('roles can be created and edited, but admin is fixed', async () => {
    assert.equal((await admin.put('/api/access-roles/admin', { permissions: [] })).status, 400);
    const created = await admin.put('/api/access-roles/recruiter', {
      name: 'Recruiter',
      permissions: [{ permission: 'people.invite', scope: 'department' }, { permission: 'people.view', scope: 'global' }],
    });
    assert.equal(created.status, 200, created.text);
    const roles = await admin.get('/api/access-roles');
    assert.ok(roles.json.catalogue['people.import']);
    assert.equal(roles.json.roles.find((r) => r.id === 'recruiter').permissions.length, 2);
    assert.equal((await signIn(portal, 'fin.member@example.com').put('/api/access-roles/recruiter', { permissions: [] })).status, 403);
  });
});

describe('bulk import and export', () => {
  const csv = [
    'email,full_name,department,position,access_role',
    'new.one@example.com,New One,marketing,Member,',
    'NEW.TWO@example.com,"Two, New",crm,,',
    'fin.member@example.com,Dup,finance,,',
    'bad-email,Bad,crm,,',
    'x4@example.com,X,nowhere,,',
    'x5@example.com,X,crm,No Such Title,',
  ].join('\n');

  test('dry run reports per-row results without writing', async () => {
    const res = await admin.post('/api/imports/people', { csv, dryRun: true });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual([res.json.invited, res.json.skipped, res.json.errors], [2, 1, 3]);
    assert.equal(personId('new.one@example.com'), undefined);
    assert.deepEqual(res.json.results.filter((r) => r.result === 'error').map((r) => r.row), [5, 6, 7]);
  });

  test('import invites valid rows with positions in the current term', async () => {
    const res = await admin.post('/api/imports/people', { csv });
    assert.equal(res.json.invited, 2);
    const one = await admin.get(`/api/people/${personId('new.one@example.com')}`);
    assert.equal(one.json.status, 'invited');
    assert.equal(one.json.tenures[0].positionId, 'pos_marketing_member');
    assert.equal(one.json.tenures[0].termId, '2027-28');
    assert.ok(personId('new.two@example.com'));
    assert.equal((await signIn(portal, 'fin.member@example.com').post('/api/imports/people', { csv })).status, 403);
  });

  test('export neutralises spreadsheet formulas', async () => {
    const id = personId('new.two@example.com');
    portal.db.prepare("UPDATE people SET full_name = '=HYPERLINK(\"http://x\")' WHERE id = ?").run(id);
    const res = await admin.get('/api/exports/people');
    assert.match(res.text, /"'=HYPERLINK\(""http:\/\/x""\)"/);
  });
});

describe('audit log', () => {
  test('admin actions are recorded and readable with audit.view only', async () => {
    const res = await admin.get(`/api/audit?targetType=person&targetId=${personId('fin.member@example.com')}`);
    assert.equal(res.status, 200);
    const actions = res.json.map((e) => e.action);
    for (const a of ['person.invite', 'person.status', 'person.access', 'profile.update_self']) assert.ok(actions.includes(a), a);
    assert.equal((await signIn(portal, 'fin.member@example.com').get('/api/audit')).status, 403);
  });
});
