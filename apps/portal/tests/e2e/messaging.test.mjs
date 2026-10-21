import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
let portal;
let admin;
let member; // finance
let colleague; // finance
let outsider; // marketing
const ids = {};
let project;

async function invite(key, email, departmentId) {
  const res = await admin.post('/api/people', { email, fullName: key, departmentId });
  assert.equal(res.status, 201, res.text);
  ids[key] = res.json.id;
}

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, ADMIN);
  await invite('member', 'm.mem@example.com', 'finance');
  await invite('colleague', 'm.col@example.com', 'finance');
  await invite('outsider', 'm.out@example.com', 'marketing');
  await invite('leaver', 'm.left@example.com', 'finance');
  member = signIn(portal, 'm.mem@example.com');
  colleague = signIn(portal, 'm.col@example.com');
  outsider = signIn(portal, 'm.out@example.com');
  project = (await admin.post('/api/projects', { name: 'Pricing model', departmentIds: ['finance'] })).json.id;
});
after(async () => {
  await portal?.stop();
});
beforeEach(() => {
  portal.db.exec(`DELETE FROM rate_limits; DELETE FROM message_notifications; DELETE FROM notification_preferences;
    UPDATE conversation_members SET muted = 0;
    UPDATE people SET status = 'active', department_id = 'finance' WHERE email IN ('m.mem@example.com', 'm.col@example.com');
    UPDATE people SET status = 'alumni' WHERE email = 'm.left@example.com';`);
});

const ok = (res, status = 200) => {
  assert.equal(res.status, status, res.text);
  return res.json;
};
const departmentChannel = async () => ok(await member.post('/api/messages/channels', { departmentId: 'finance' })).id;
const send = async (client, conversationId, body, extra = {}) =>
  ok(await client.post(`/api/messages/conversations/${conversationId}/messages`, { requestId: randomUUID(), body, ...extra }), 201).id;
const page = async (client, conversationId) => ok(await client.get(`/api/messages/conversations/${conversationId}/messages`)).messages;
const listed = async (client) => ok(await client.get('/api/messages/conversations')).conversations.map((c) => c.id);
const unread = async (client) => ok(await client.get('/api/messages/unread')).unread;
const search = async (client, q) => ok(await client.get(`/api/messages/search?q=${encodeURIComponent(q)}`)).results;
const mentionNotices = async (client) => ok(await client.get('/api/notifications/mentions')).mentions;

test('messaging needs a session and validates input', async () => {
  const anon = anonymous(portal);
  assert.equal((await anon.get('/api/messages/conversations')).status, 401);
  assert.equal((await anon.get('/api/messages/unread')).status, 401);
  assert.equal((await anon.post('/api/messages/direct', { personId: ids.member })).status, 401);
  assert.equal((await member.get('/api/messages/search?q=a')).status, 400);
  const channel = await departmentChannel();
  assert.equal((await member.post(`/api/messages/conversations/${channel}/messages`, { requestId: randomUUID(), body: '   ' })).status, 400);
  assert.equal((await member.post(`/api/messages/conversations/${channel}/messages`, { requestId: randomUUID(), body: 'x'.repeat(4001) })).status, 400);
});

test('direct conversations exist only between current members and stay private to the pair', async () => {
  const dm = ok(await member.post('/api/messages/direct', { personId: ids.colleague })).id;
  assert.equal(ok(await colleague.post('/api/messages/direct', { personId: ids.member })).id, dm);
  assert.equal((await member.post('/api/messages/direct', { personId: ids.member })).status, 400);
  assert.equal((await member.post('/api/messages/direct', { personId: ids.leaver })).status, 404);
  assert.equal((await member.post('/api/messages/direct', { personId: 'person_missing' })).status, 404);

  await send(member, dm, 'Private hello');
  assert.ok((await listed(colleague)).includes(dm));
  assert.equal(ok(await colleague.get(`/api/messages/conversations/${dm}`)).title, 'member');
  assert.equal((await outsider.get(`/api/messages/conversations/${dm}`)).status, 404);
  assert.equal((await outsider.get(`/api/messages/conversations/${dm}/messages`)).status, 404);
  assert.equal((await outsider.post(`/api/messages/conversations/${dm}/messages`, { requestId: randomUUID(), body: 'hi' })).status, 404);
  assert.ok(!(await listed(outsider)).includes(dm));
  assert.deepEqual(await search(outsider, 'Private hello'), []);

  // Once the other person leaves the club the conversation is read only; the leaver has no access at all.
  portal.db.prepare("UPDATE people SET status = 'alumni' WHERE id = ?").run(ids.colleague);
  assert.equal((await colleague.get(`/api/messages/conversations/${dm}`)).status, 401);
  assert.equal(ok(await member.get(`/api/messages/conversations/${dm}`)).canSend, false);
  const blocked = await member.post(`/api/messages/conversations/${dm}/messages`, { requestId: randomUUID(), body: 'Still there?' });
  assert.equal(blocked.status, 409, blocked.text);
});

test('outsiders get 404 for a department channel and never see it in lists, unread counts or search', async () => {
  const channel = await departmentChannel();
  assert.equal((await outsider.post('/api/messages/channels', { departmentId: 'finance' })).status, 404);
  const secret = `Budget secret ${randomUUID()}`;
  await send(member, channel, secret);

  assert.equal((await outsider.get(`/api/messages/conversations/${channel}`)).status, 404);
  assert.equal((await outsider.get(`/api/messages/conversations/${channel}/messages`)).status, 404);
  assert.equal((await outsider.get(`/api/messages/conversations/${channel}/people`)).status, 404);
  assert.ok(!(await listed(outsider)).includes(channel));
  assert.equal(await unread(outsider), 0);
  assert.deepEqual(await search(outsider, secret), []);

  assert.ok((await listed(colleague)).includes(channel));
  assert.ok((await unread(colleague)) >= 1);
  assert.deepEqual((await search(colleague, secret)).map((r) => r.conversationId), [channel]);

  // Moving department removes access on the next request, including search and counts.
  portal.db.prepare("UPDATE people SET department_id = 'marketing' WHERE id = ?").run(ids.colleague);
  assert.equal((await colleague.get(`/api/messages/conversations/${channel}/messages`)).status, 404);
  assert.ok(!(await listed(colleague)).includes(channel));
  assert.deepEqual(await search(colleague, secret), []);
});

test('a project channel follows project visibility, and a removed project member loses it', async () => {
  const channel = ok(await member.post('/api/messages/channels', { projectId: project })).id;
  assert.equal((await outsider.post('/api/messages/channels', { projectId: project })).status, 404);
  const text = `Project only ${randomUUID()}`;
  await send(member, channel, text);
  assert.equal((await outsider.get(`/api/messages/conversations/${channel}/messages`)).status, 404);
  assert.deepEqual(await search(outsider, text), []);

  portal.db.prepare("INSERT INTO project_members (id, project_id, person_id, role) VALUES (?, ?, ?, 'member')").run(randomUUID(), project, ids.outsider);
  assert.equal((await page(outsider, channel))[0].body, text);
  portal.db.prepare('DELETE FROM project_members WHERE project_id = ? AND person_id = ?').run(project, ids.outsider);
  assert.equal((await outsider.get(`/api/messages/conversations/${channel}/messages`)).status, 404);
  assert.deepEqual(await search(outsider, text), []);
  assert.equal(await unread(outsider), 0);
});

test('only the author edits, and only within 15 minutes', async () => {
  const channel = await departmentChannel();
  const id = await send(member, channel, 'First draft');
  const path = `/api/messages/conversations/${channel}/messages/${id}`;
  ok(await member.patch(path, { body: 'Second draft' }));
  const [edited] = await page(colleague, channel);
  assert.equal(edited.body, 'Second draft');
  assert.ok(edited.editedAt);
  assert.equal((await colleague.patch(path, { body: 'Hijack' })).status, 403);

  portal.db.prepare("UPDATE messages SET created_at = datetime('now', '-16 minutes') WHERE id = ?").run(id);
  const late = await member.patch(path, { body: 'Too late' });
  assert.equal(late.status, 409);
  assert.ok(late.text.includes('edit_window_closed'));
});

test('deleting leaves a tombstone without the body, its reactions or its search hit', async () => {
  const channel = await departmentChannel();
  const text = `Delete me ${randomUUID()}`;
  const id = await send(member, channel, text);
  const path = `/api/messages/conversations/${channel}/messages/${id}`;
  assert.deepEqual(ok(await colleague.post(`${path}/reactions`, { emoji: '👍' })).reactions, [{ emoji: '👍', count: 1, mine: true }]);
  assert.equal((await colleague.del(path)).status, 403);
  ok(await member.del(path));

  const tomb = (await page(colleague, channel)).find((m) => m.id === id);
  assert.deepEqual([tomb.body, tomb.deleted, tomb.reactions], [null, true, []]);
  assert.equal(portal.db.prepare('SELECT body FROM messages WHERE id = ?').get(id).body, '');
  assert.deepEqual(await search(colleague, text), []);
  assert.equal((await member.patch(path, { body: 'Back' })).status, 409);
  assert.equal((await colleague.post(`${path}/reactions`, { emoji: '👍' })).status, 409);
});

test('a retried send returns the first message; reusing the requestId for other text is a conflict', async () => {
  const channel = await departmentChannel();
  const requestId = randomUUID();
  const first = ok(await member.post(`/api/messages/conversations/${channel}/messages`, { requestId, body: 'Once' }), 201);
  const again = ok(await member.post(`/api/messages/conversations/${channel}/messages`, { requestId, body: 'Once' }), 201);
  assert.deepEqual([again.id, again.replayed], [first.id, true]);
  assert.equal((await member.post(`/api/messages/conversations/${channel}/messages`, { requestId, body: 'Different' })).status, 409);
});

test('a mention notifies only mentioned people who can read the conversation, once', async () => {
  const channel = await departmentChannel();
  const body = `Review this @[colleague](${ids.colleague}) and @[outsider](${ids.outsider}) @[member](${ids.member})`;
  const id = await send(member, channel, body);
  ok(await member.patch(`/api/messages/conversations/${channel}/messages/${id}`, { body: `${body}!` }));

  const notices = await mentionNotices(colleague);
  assert.deepEqual(notices.map((n) => [n.kind, n.messageId, n.conversationId, n.actorName]), [['message_mention', id, channel, 'member']]);
  assert.ok(notices[0].preview.startsWith('Review this @colleague'));
  assert.deepEqual(await mentionNotices(outsider), []);
  assert.deepEqual(await mentionNotices(member), []);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM message_notifications WHERE message_id = ?').get(id).n, 1);
  assert.ok(ok(await colleague.get('/api/notifications/count')).unread >= 1);

  // Reading the conversation clears the notice; losing access hides it.
  ok(await colleague.post(`/api/messages/conversations/${channel}/read`, { upTo: id }));
  assert.ok((await mentionNotices(colleague))[0].readAt);
  portal.db.prepare("UPDATE people SET department_id = 'marketing' WHERE id = ?").run(ids.colleague);
  assert.deepEqual(await mentionNotices(colleague), []);
});

test('muting a conversation or turning off mention notices stops new notices; muted conversations leave the badge', async () => {
  const channel = await departmentChannel();
  ok(await colleague.post(`/api/messages/conversations/${channel}/read`, { upTo: 1e9 }));
  ok(await colleague.put(`/api/messages/conversations/${channel}/mute`, { muted: true }));
  const baseline = await unread(colleague);
  await send(member, channel, `Muted ping @[colleague](${ids.colleague})`);
  assert.deepEqual(await mentionNotices(colleague), []);
  assert.equal(await unread(colleague), baseline);
  assert.equal(ok(await colleague.get('/api/messages/conversations')).conversations.find((c) => c.id === channel).unread, 1);

  ok(await colleague.put(`/api/messages/conversations/${channel}/mute`, { muted: false }));
  const prefs = ok(await colleague.get('/api/notification-preferences')).preferences;
  assert.deepEqual(prefs.map((p) => [p.category, p.inApp, p.emailDigest]), [['mentions', true, false], ['tasks', true, false]]);
  ok(await colleague.put('/api/notification-preferences', {
    preferences: [{ category: 'mentions', inApp: false, emailDigest: false, quietStart: '22:00', quietEnd: '07:00' }],
  }));
  await send(member, channel, `Prefs ping @[colleague](${ids.colleague})`);
  assert.deepEqual(await mentionNotices(colleague), []);
});

test('turning off in-app task notices stops task assignment notices', async () => {
  ok(await colleague.put('/api/notification-preferences', {
    preferences: [{ category: 'tasks', inApp: false, emailDigest: true, quietStart: null, quietEnd: null }],
  }));
  assert.equal(ok(await colleague.get('/api/notification-preferences')).preferences.find((p) => p.category === 'tasks').emailDigest, true);
  ok(await admin.post(`/api/projects/${project}/tasks`, { title: 'Quiet task', assigneeId: ids.colleague }), 201);
  ok(await admin.post(`/api/projects/${project}/tasks`, { title: 'Loud task', assigneeId: ids.member }), 201);
  const kinds = (who) => portal.db.prepare("SELECT count(*) AS n FROM notifications WHERE recipient_id = ? AND kind = 'task_assigned'").get(who).n;
  assert.equal(kinds(ids.colleague), 0);
  assert.equal(kinds(ids.member), 1);
});

test('preferences reject half-set quiet hours and unknown categories', async () => {
  const put = (pref) => member.put('/api/notification-preferences', { preferences: [pref] });
  assert.equal((await put({ category: 'mentions', inApp: true, emailDigest: false, quietStart: '22:00', quietEnd: null })).status, 400);
  assert.equal((await put({ category: 'mentions', inApp: true, emailDigest: false, quietStart: '25:00', quietEnd: '07:00' })).status, 400);
  assert.equal((await put({ category: 'email', inApp: true, emailDigest: false, quietStart: null, quietEnd: null })).status, 400);
});

test('reported messages reach chat.moderate holders, who can remove them with an audit entry but no text', async () => {
  const channel = await departmentChannel();
  const text = `Offensive ${randomUUID()}`;
  const id = await send(member, channel, text);
  const path = `/api/messages/conversations/${channel}/messages/${id}/report`;
  assert.equal((await member.post(path, { reason: 'mine' })).status, 400);
  ok(await colleague.post(path, { reason: 'Rude' }), 201);
  ok(await colleague.post(path, { reason: 'Rude' }), 201);
  assert.equal((await outsider.post(path, { reason: 'Nosy' })).status, 404);
  assert.equal((await member.get('/api/messages/reports')).status, 403);

  const report = ok(await admin.get('/api/messages/reports')).reports.find((r) => r.messageId === id);
  assert.deepEqual([report.reason, report.body, report.reporterName, report.authorName], ['Rude', text, 'colleague', 'member']);
  assert.equal((await member.post(`/api/messages/reports/${report.id}`, { action: 'remove' })).status, 403);
  ok(await admin.post(`/api/messages/reports/${report.id}`, { action: 'remove' }));
  assert.equal((await page(colleague, channel)).find((m) => m.id === id).body, null);
  assert.ok(!ok(await admin.get('/api/messages/reports')).reports.some((r) => r.messageId === id));
  const audit = portal.db.prepare("SELECT details FROM audit_log WHERE action = 'message.remove' AND target_id = ?").get(String(id));
  assert.ok(audit && !audit.details.includes(text));
});

test('messages page backwards 50 at a time and unread counts stop at 99', async () => {
  const dm = ok(await outsider.post('/api/messages/direct', { personId: ids.member })).id;
  const insert = portal.db.prepare("INSERT INTO messages (conversation_id, author_id, body, request_id) VALUES (?, ?, 'bulk', ?)");
  for (let i = 0; i < 120; i++) insert.run(dm, ids.outsider, randomUUID());
  portal.db.prepare('UPDATE conversations SET last_message_id = (SELECT max(id) FROM messages) WHERE id = ?').run(dm);
  const seen = [];
  let cursor = null;
  do {
    const res = ok(await member.get(`/api/messages/conversations/${dm}/messages${cursor ? `?before=${cursor}` : ''}`));
    assert.ok(res.messages.length <= 50);
    seen.push(...res.messages.map((m) => m.id));
    cursor = res.nextBefore;
  } while (cursor);
  assert.equal(new Set(seen).size, 120);
  const row = ok(await member.get('/api/messages/conversations')).conversations.find((c) => c.id === dm);
  assert.deepEqual([row.unread, row.unreadCapped], [99, true]);
  assert.deepEqual(ok(await member.get('/api/messages/unread')), { unread: 99, capped: true });
});
