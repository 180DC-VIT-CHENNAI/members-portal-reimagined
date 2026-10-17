import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
const HOUR = 3_600_000;
let portal;
let admin;
let director; // finance director
let member; // finance member
let advisory; // finance advisory
let outsider; // marketing member

async function invite(email, departmentId, accessRoleId) {
  const res = await admin.post('/api/people', { email, fullName: email.split('@')[0], departmentId, ...(accessRoleId ? { accessRoleId } : {}) });
  assert.equal(res.status, 201, res.text);
  return res.json.id;
}

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, ADMIN);
  await invite('dir.finance@example.com', 'finance', 'director');
  await invite('mem.finance@example.com', 'finance');
  await invite('adv.finance@example.com', 'finance', 'advisory');
  await invite('adv.nodept@example.com', null, 'advisory');
  await invite('mem.marketing@example.com', 'marketing');
  await invite('invited.only@example.com', 'finance');
  const alumni = await invite('alumni@example.com', 'finance');
  director = signIn(portal, 'dir.finance@example.com');
  member = signIn(portal, 'mem.finance@example.com');
  advisory = signIn(portal, 'adv.finance@example.com');
  signIn(portal, 'adv.nodept@example.com');
  outsider = signIn(portal, 'mem.marketing@example.com');
  signIn(portal, 'alumni@example.com');
  assert.equal((await admin.post(`/api/people/${alumni}/status`, { status: 'alumni' })).status, 200);
});
after(async () => {
  await portal?.stop();
});
beforeEach(() => {
  portal.db.exec('DELETE FROM rate_limits; DELETE FROM email_queue; DELETE FROM email_deliveries; DELETE FROM dev_outbox;');
});

const at = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const schedule = (client, body) => client.post('/api/meets', { title: 'Weekly sync', scheduledAt: at(48 * HOUR), ...body });
const campaign = (id) => portal.db.prepare('SELECT * FROM email_queue WHERE id = ?').get(id);
const recipients = (id) => JSON.parse(campaign(id).recipients).sort();
const FINANCE = ['adv.finance@example.com', 'dir.finance@example.com', 'mem.finance@example.com'];

test('every meets route needs a session', async () => {
  const anon = anonymous(portal);
  assert.equal((await anon.get('/api/meets')).status, 401);
  assert.equal((await anon.post('/api/meets', { kind: 'club', title: 't', scheduledAt: at(HOUR) })).status, 401);
  assert.equal((await anon.del('/api/meets/missing')).status, 401);
  assert.equal((await anon.post('/api/meets/missing/notify', {})).status, 401);
});

test('club meets: directors schedule them and every active member except advisory without a department is emailed', async () => {
  const res = await schedule(director, {
    kind: 'club', title: 'All hands <b>', meetLink: 'https://meet.example.com/abc?x=1&y=2', description: 'Agenda\nBudget',
  });
  assert.equal(res.status, 201, res.text);
  const everyone = [...FINANCE, 'mem.marketing@example.com', ADMIN].sort();
  assert.equal(res.json.queued, everyone.length);
  assert.deepEqual(recipients(res.json.campaignId), everyone);
  const queued = campaign(res.json.campaignId);
  assert.equal(queued.kind, 'meet');
  assert.equal(queued.subject, 'New meet: All hands <b>');
  assert.deepEqual(JSON.parse(queued.meta), { meetId: res.json.id, replyTo: 'dir.finance@example.com' });
  assert.ok(queued.html.includes('href="https://meet.example.com/abc?x=1&amp;y=2"'));
  assert.ok(!queued.html.includes('<b>'));

  await portal.runCron();
  const sent = (await admin.get('/api/dev/outbox')).json.messages;
  assert.deepEqual(sent.map((m) => m.recipient).sort(), everyone);
  assert.ok(sent.every((m) => m.fromAddress === '180DC Admin <noreply@180dc.vitcc.org>' && m.headers['Reply-To'] === 'dir.finance@example.com'));

  assert.equal((await schedule(member, { kind: 'club' })).status, 403);
  assert.equal((await schedule(advisory, { kind: 'club' })).status, 403);
});

test('department meets: directors manage only their own department; admins manage any', async () => {
  const own = await schedule(director, { kind: 'department', departmentIds: ['finance'] });
  assert.equal(own.status, 201, own.text);
  assert.deepEqual(recipients(own.json.campaignId), FINANCE);
  assert.equal((await schedule(director, { kind: 'department', departmentIds: ['marketing'] })).status, 403);
  assert.equal((await schedule(member, { kind: 'department', departmentIds: ['finance'] })).status, 403);
  const other = await schedule(admin, { kind: 'department', departmentIds: ['marketing'], title: 'Marketing sync' });
  assert.equal(other.status, 201, other.text);
  assert.deepEqual(recipients(other.json.campaignId), ['mem.marketing@example.com']);
  assert.equal((await schedule(admin, { kind: 'department', departmentIds: ['finance', 'marketing'] })).status, 400);
  assert.equal((await schedule(admin, { kind: 'department', departmentIds: [] })).status, 400);
});

test('inter-department meets reach exactly the selected departments', async () => {
  const res = await schedule(director, { kind: 'inter_department', departmentIds: ['finance', 'marketing', 'finance'] });
  assert.equal(res.status, 201, res.text);
  assert.deepEqual(recipients(res.json.campaignId), [...FINANCE, 'mem.marketing@example.com'].sort());
  assert.equal((await schedule(director, { kind: 'inter_department', departmentIds: ['nope'] })).status, 400);
  assert.equal((await schedule(director, { kind: 'inter_department', departmentIds: [] })).status, 400);
  assert.equal((await schedule(director, { kind: 'club', departmentIds: ['finance'] })).status, 400);
});

test('members see club-wide and inter-department meets and only their own department meets', async () => {
  const kinds = (list) => list.map((m) => `${m.kind}:${m.departments.map((d) => d.id).join('+')}`);
  const mine = await member.get('/api/meets');
  assert.equal(mine.status, 200, mine.text);
  assert.ok(kinds(mine.json).includes('club:'));
  assert.ok(kinds(mine.json).includes('inter_department:finance+marketing'));
  assert.ok(kinds(mine.json).includes('department:finance'));
  assert.ok(!kinds(mine.json).includes('department:marketing'));
  const theirs = kinds((await outsider.get('/api/meets')).json);
  assert.ok(theirs.includes('department:marketing') && !theirs.includes('department:finance'));
  const all = kinds((await admin.get('/api/meets')).json);
  assert.ok(all.includes('department:marketing') && all.includes('department:finance'));
  const departments = mine.json.find((m) => m.kind === 'inter_department').departments;
  assert.deepEqual(departments.map((d) => d.name), ['Finance', 'Marketing']);
});

test('a meet link disappears from listings a day after the meet without changing what is stored', async () => {
  const insert = portal.db.prepare("INSERT INTO meets (id, kind, title, meet_link, scheduled_at) VALUES (?, 'club', ?, 'https://meet.example.com/x', ?)");
  insert.run('link_recent', 'Almost a day ago', at(-(24 * HOUR - 5 * 60_000)));
  insert.run('link_old', 'Over a day ago', at(-(24 * HOUR + 5 * 60_000)));
  insert.run('link_future', 'Tomorrow', at(24 * HOUR));
  const list = (await member.get('/api/meets')).json;
  const link = (id) => list.find((m) => m.id === id).meetLink;
  assert.equal(link('link_recent'), 'https://meet.example.com/x');
  assert.equal(link('link_old'), null);
  assert.equal(link('link_future'), 'https://meet.example.com/x');
  assert.equal(portal.db.prepare("SELECT meet_link FROM meets WHERE id = 'link_old'").get().meet_link, 'https://meet.example.com/x');
  const resent = await admin.post('/api/meets/link_old/notify', {});
  assert.equal(resent.status, 200, resent.text);
  assert.ok(!campaign(resent.json.campaignId).html.includes('href='), 'a past meet is re-announced without its link');
});

test('removing meets: directors only in their own department; missing meets are 404', async () => {
  const finance = (await schedule(director, { kind: 'department', departmentIds: ['finance'] })).json.id;
  const marketing = (await schedule(admin, { kind: 'department', departmentIds: ['marketing'] })).json.id;
  assert.equal((await director.del(`/api/meets/${marketing}`)).status, 403);
  assert.equal((await member.del(`/api/meets/${finance}`)).status, 403);
  assert.equal((await director.del(`/api/meets/${finance}`)).status, 200);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM meet_departments WHERE meet_id = ?').get(finance).n, 0);
  assert.equal((await director.del(`/api/meets/${finance}`)).status, 404);
  assert.equal((await director.post(`/api/meets/${marketing}/notify`, {})).status, 403);
});

test('re-announcing creates a fresh campaign and is limited to ten an hour per client', async () => {
  const id = (await schedule(director, { kind: 'club' })).json.id;
  const campaigns = new Set();
  for (let i = 0; i < 10; i++) {
    const res = await director.post(`/api/meets/${id}/notify`, {});
    assert.equal(res.status, 200, res.text);
    campaigns.add(res.json.campaignId);
  }
  assert.equal(campaigns.size, 10);
  assert.equal((await director.post(`/api/meets/${id}/notify`, {})).status, 429);
});

test('validation rejects malformed times, non-web links and blank titles', async () => {
  assert.equal((await schedule(director, { kind: 'club', scheduledAt: 'tomorrow' })).status, 400);
  assert.equal((await schedule(director, { kind: 'club', meetLink: 'javascript:alert(1)' })).status, 400);
  assert.equal((await schedule(director, { kind: 'club', meetLink: 'ftp://files.example.com/x' })).status, 400);
  assert.equal((await schedule(director, { kind: 'club', title: '   ' })).status, 400);
  assert.equal((await schedule(director, { kind: 'weekly' })).status, 400);
});
