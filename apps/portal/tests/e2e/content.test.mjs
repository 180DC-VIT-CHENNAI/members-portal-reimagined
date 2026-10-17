import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
const MEMBER = 'content.member@example.com';
const DIRECTOR = 'content.director@example.com';
let portal;
let admin;
let member;
let director;
let publicClient;

before(async () => {
  portal = await startPortal();
  admin = signIn(portal, ADMIN);
  publicClient = anonymous(portal);
  const invites = [
    { email: MEMBER, fullName: 'Casey Member', departmentId: 'finance', positionId: 'pos_finance_member' },
    { email: DIRECTOR, fullName: 'Dana Director', departmentId: 'marketing', accessRoleId: 'director', positionId: 'pos_marketing_director' },
    { email: 'not.yet@example.com', fullName: 'Invited Only', departmentId: 'tech', positionId: 'pos_tech_member' },
  ];
  for (const body of invites) {
    const res = await admin.post('/api/people', body);
    assert.equal(res.status, 201, res.text);
  }
  member = signIn(portal, MEMBER);
  director = signIn(portal, DIRECTOR);
  const memberId = portal.db.prepare('SELECT id FROM people WHERE email = ?').get(MEMBER).id;
  const profile = await member.patch(`/api/people/${memberId}`, {
    phone: '+91 90000 11111',
    regNo: '23BCE9999',
    linkedinUrl: 'https://www.linkedin.com/in/casey',
    photoKey: 'https://example.com/casey.jpg',
  });
  assert.equal(profile.status, 200, profile.text);
});
after(async () => {
  await portal?.stop();
});

describe('public content', () => {
  test('case studies, partners and maintenance status are readable signed out', async () => {
    const cs = await publicClient.get('/api/content/case-studies');
    assert.equal(cs.status, 200, cs.text);
    assert.ok(Array.isArray(cs.json));
    const partners = await publicClient.get('/api/content/partners');
    assert.equal(partners.status, 200);
    assert.equal(partners.json.length, 5);
    assert.equal(partners.json[0].name, 'AdigoVR');
    assert.equal(partners.json[0].logoUrl, '/partners/adigo.png');
    const mm = await publicClient.get('/api/admin/maintenance');
    assert.equal(mm.status, 200);
    assert.equal(mm.json.enabled, false);
  });

  test('team members come from current-term tenures and expose only public fields', async () => {
    const res = await publicClient.get('/api/content/team-members');
    assert.equal(res.status, 200, res.text);
    const names = res.json.map((m) => m.name);
    assert.ok(names.includes('Srijan Guchhait'));
    assert.ok(names.includes('Casey Member'));
    assert.ok(names.includes('Dana Director'));
    assert.ok(!names.includes('Invited Only'), 'invited people are not on the team page');
    const casey = res.json.find((m) => m.name === 'Casey Member');
    assert.deepEqual(Object.keys(casey).sort(), ['department', 'linkedin', 'name', 'photo', 'positions', 'rank']);
    assert.equal(casey.department, 'Finance');
    assert.equal(casey.linkedin, 'https://www.linkedin.com/in/casey');
    assert.equal(casey.photo, 'https://example.com/casey.jpg');
    assert.deepEqual(casey.positions, [{ title: 'Member', department: 'Finance' }]);
    for (const secret of [MEMBER, ADMIN, '90000 11111', '23BCE9999']) assert.ok(!res.text.includes(secret), `leaked ${secret}`);
  });

  test('alumni drop off the team page', async () => {
    const id = portal.db.prepare('SELECT id FROM people WHERE email = ?').get(DIRECTOR).id;
    portal.db.prepare("UPDATE people SET status = 'alumni' WHERE id = ?").run(id);
    const res = await publicClient.get('/api/content/team-members');
    assert.ok(!res.json.some((m) => m.name === 'Dana Director'));
    portal.db.prepare("UPDATE people SET status = 'active' WHERE id = ?").run(id);
  });
});

describe('permissions', () => {
  test('roles hold the new keys as the old power levels did', async () => {
    const a = (await admin.get('/api/me')).json.permissions;
    for (const key of ['content.publish', 'content.manage', 'consulting.manage', 'announcements.manage', 'site.maintenance']) assert.equal(a[key], 'global', key);
    const d = (await director.get('/api/me')).json.permissions;
    assert.equal(d['content.manage'], 'global');
    assert.equal(d['consulting.manage'], undefined);
    assert.equal(d['announcements.manage'], undefined);
    const m = (await member.get('/api/me')).json.permissions;
    assert.equal(m['content.publish'], 'global');
    assert.equal(m['content.manage'], undefined);
  });
});

describe('consulting requests', () => {
  const valid = { name: 'Asha', email: 'Asha@NGO.example.org', phone: '+91 98765 43210', organization: 'Helping Hands', roleInOrg: 'Founder', requirement: 'We need a fundraising strategy.' };

  test('public submission is validated and limited to one per hour', async () => {
    assert.equal((await publicClient.post('/api/consulting-request', { ...valid, email: 'nope' })).status, 400);
    assert.equal((await publicClient.post('/api/consulting-request', { ...valid, requirement: '' })).status, 400);
    assert.equal((await publicClient.post('/api/consulting-request', { ...valid, phone: 'call me' })).status, 400);
    const ok = await publicClient.post('/api/consulting-request', valid);
    assert.equal(ok.status, 201, ok.text);
    assert.deepEqual(ok.json, { submitted: true });
    const again = await publicClient.post('/api/consulting-request', valid);
    assert.equal(again.status, 429);
    assert.ok(Number(again.headers.get('retry-after')) > 0);
  });

  test('only consulting managers can list and decide', async () => {
    assert.equal((await publicClient.get('/api/consulting-requests')).status, 401);
    assert.equal((await member.get('/api/consulting-requests')).status, 403);
    assert.equal((await director.get('/api/consulting-requests')).status, 403);
    const list = await admin.get('/api/consulting-requests');
    assert.equal(list.status, 200);
    assert.equal(list.json.length, 1);
    assert.equal(list.json[0].email, 'asha@ngo.example.org');
    assert.equal(list.json[0].status, 'pending');
    const id = list.json[0].id;
    assert.equal((await member.post(`/api/consulting-requests/${id}/accept`, { emailSubject: 'Hi', emailBody: 'Yes' })).status, 403);
    assert.equal((await member.del(`/api/consulting-requests/${id}`)).status, 403);
  });

  test('admin accepts and rejects pending requests once', async () => {
    portal.db
      .prepare("INSERT INTO consulting_requests (id, name, email, phone, organization, requirement) VALUES ('req_second', 'Ravi', 'ravi@example.org', '9999999999', 'Green Earth', 'Help with operations')")
      .run();
    const [first] = (await admin.get('/api/consulting-requests')).json.filter((r) => r.organization === 'Helping Hands');
    assert.equal((await admin.post(`/api/consulting-requests/${first.id}/accept`, { emailSubject: '', emailBody: 'x' })).status, 400);
    const accepted = await admin.post(`/api/consulting-requests/${first.id}/accept`, { emailSubject: 'Welcome aboard', emailBody: 'We would love to help.' });
    assert.equal(accepted.status, 200, accepted.text);
    assert.equal(accepted.json.status, 'accepted');
    // No capture mode here: Void's dev inbox accepts the reply, as Cloudflare would.
    assert.equal(accepted.json.emailSent, true);
    assert.equal((await admin.post(`/api/consulting-requests/${first.id}/reject`, { emailSubject: 'No', emailBody: 'No' })).status, 400);
    const rejected = await admin.post('/api/consulting-requests/req_second/reject', { emailSubject: 'Sorry', emailBody: 'Not this term.' });
    assert.equal(rejected.status, 200, rejected.text);
    assert.equal(rejected.json.status, 'rejected');
    assert.equal((await admin.post('/api/consulting-requests/missing/accept', { emailSubject: 'a', emailBody: 'b' })).status, 404);

    const list = (await admin.get('/api/consulting-requests')).json;
    const byId = Object.fromEntries(list.map((r) => [r.id, r]));
    assert.equal(byId[first.id].response.emailSubject, 'Welcome aboard');
    assert.equal(byId.req_second.status, 'rejected');
    assert.equal(byId.req_second.response.emailBody, 'Not this term.');
  });

  test('admin deletes a request with its reply', async () => {
    assert.equal((await admin.del('/api/consulting-requests/req_second')).status, 204);
    assert.equal(portal.db.prepare("SELECT COUNT(*) AS n FROM consulting_responses WHERE request_id = 'req_second'").get().n, 0);
    assert.equal((await admin.del('/api/consulting-requests/req_second')).status, 404);
    assert.equal((await admin.get('/api/consulting-requests')).json.length, 1);
  });
});

describe('case studies', () => {
  let id;

  test('members publish sanitised case studies', async () => {
    assert.equal((await publicClient.post('/api/case-studies', { title: 'X', content: 'Long enough content' })).status, 401);
    assert.equal((await member.post('/api/case-studies', { title: 'Short', content: 'tiny' })).status, 400);
    assert.equal((await member.post('/api/case-studies', { title: 'Tags', content: '<script>alert(1)</script><b></b>' })).status, 400);
    assert.equal((await member.post('/api/case-studies', { title: 'Bad link', content: 'Long enough content', sourceFileUrl: 'javascript:alert(1)' })).status, 400);
    const res = await member.post('/api/case-studies', {
      tag: 'Strategy',
      title: 'Scaling a food bank',
      description: 'How we doubled reach',
      content: '<p onclick="steal()">We mapped <a href="javascript:alert(1)">donors</a>.</p><script>alert(1)</script>',
    });
    assert.equal(res.status, 201, res.text);
    id = res.json.id;
    const stored = portal.db.prepare('SELECT * FROM case_studies WHERE id = ?').get(id);
    assert.equal(stored.author_name, 'Casey Member');
    assert.ok(!stored.content.includes('script'));
    assert.ok(!stored.content.includes('onclick'));
    assert.ok(!stored.content.includes('javascript:'));
  });

  test('the public list shows it without the author id', async () => {
    const list = (await publicClient.get('/api/content/case-studies')).json;
    const cs = list.find((c) => c.id === id);
    assert.equal(cs.title, 'Scaling a food bank');
    assert.equal(cs.authorName, 'Casey Member');
    assert.equal('createdBy' in cs, false);
  });

  test('editors list and update; only content managers delete', async () => {
    assert.equal((await publicClient.get('/api/case-studies')).status, 401);
    const list = await member.get('/api/case-studies');
    assert.equal(list.status, 200);
    assert.ok(list.json.some((c) => c.id === id));
    const updated = await member.put(`/api/case-studies/${id}`, { tag: 'Ops', title: 'Scaling a food bank, part 2', content: '<p>Revised story with numbers.</p>', sourceFileUrl: 'https://example.com/report.pdf' });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.json.title, 'Scaling a food bank, part 2');
    assert.equal(updated.json.sourceFileUrl, 'https://example.com/report.pdf');
    assert.equal((await member.put('/api/case-studies/missing', { content: 'Long enough content' })).status, 404);
    assert.equal((await member.del(`/api/case-studies/${id}`)).status, 403);
    assert.equal((await director.del(`/api/case-studies/${id}`)).status, 204);
    assert.equal((await director.del(`/api/case-studies/${id}`)).status, 404);
    assert.ok(!(await publicClient.get('/api/content/case-studies')).json.some((c) => c.id === id));
  });
});

describe('partners', () => {
  test('content managers add, edit and remove partners', async () => {
    assert.equal((await member.post('/api/partners', { name: 'Nope' })).status, 403);
    assert.equal((await director.post('/api/partners', { name: 'Bad', logoUrl: '//evil.example.com/x.png' })).status, 400);
    const created = await director.post('/api/partners', { name: 'River Trust', logoUrl: 'https://example.org/logo.png', sortOrder: 5 });
    assert.equal(created.status, 201, created.text);
    const id = created.json.id;
    assert.equal((await publicClient.get('/api/content/partners')).json[0].name, 'River Trust');
    const patched = await director.patch(`/api/partners/${id}`, { name: 'River Trust India' });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.name, 'River Trust India');
    assert.equal((await member.del(`/api/partners/${id}`)).status, 403);
    assert.equal((await director.del(`/api/partners/${id}`)).status, 204);
    assert.equal((await publicClient.get('/api/content/partners')).json.length, 5);
  });
});

describe('announcements', () => {
  test('members read; only announcement managers post and remove', async () => {
    assert.equal((await publicClient.get('/api/announcements')).status, 401);
    assert.equal((await member.post('/api/announcements', { title: 'Hi', content: 'There' })).status, 403);
    assert.equal((await director.post('/api/announcements', { title: 'Hi', content: 'There' })).status, 403);
    assert.equal((await admin.post('/api/announcements', { title: '', content: 'There' })).status, 400);
    const created = await admin.post('/api/announcements', { title: '<b>General body meet</b>', content: 'Friday 6 pm, <i>AB1</i>' });
    assert.equal(created.status, 201, created.text);
    const list = await member.get('/api/announcements');
    assert.equal(list.status, 200);
    assert.equal(list.json.length, 1);
    assert.equal(list.json[0].title, 'General body meet');
    assert.equal(list.json[0].content, 'Friday 6 pm, AB1');
    assert.equal(list.json[0].authorName, 'Srijan Guchhait');
    assert.equal((await director.del(`/api/announcements/${created.json.id}`)).status, 403);
    assert.equal((await admin.del(`/api/announcements/${created.json.id}`)).status, 204);
    assert.equal((await admin.del(`/api/announcements/${created.json.id}`)).status, 404);
    assert.equal((await member.get('/api/announcements')).json.length, 0);
  });
});

describe('maintenance mode', () => {
  test('only admins toggle it; while on, members get 503 and public pages still work', async () => {
    assert.equal((await publicClient.post('/api/admin/maintenance', { enabled: true })).status, 401);
    assert.equal((await member.post('/api/admin/maintenance', { enabled: true })).status, 403);
    assert.equal((await director.post('/api/admin/maintenance', { enabled: true })).status, 403);
    const on = await admin.post('/api/admin/maintenance', { enabled: true, message: 'Back at 9 pm' });
    assert.equal(on.status, 200, on.text);
    assert.deepEqual(on.json, { enabled: true, message: 'Back at 9 pm' });
    assert.deepEqual((await publicClient.get('/api/admin/maintenance')).json, { enabled: true, message: 'Back at 9 pm' });

    const blocked = await member.get('/api/me');
    assert.equal(blocked.status, 503);
    assert.equal(blocked.text, 'maintenance');
    assert.equal((await admin.get('/api/me')).status, 200);
    assert.equal((await publicClient.get('/api/content/partners')).status, 200);

    const off = await admin.post('/api/admin/maintenance', { enabled: false });
    assert.equal(off.status, 200);
    assert.equal(off.json.enabled, false);
    assert.equal((await member.get('/api/me')).status, 200);
  });
});
