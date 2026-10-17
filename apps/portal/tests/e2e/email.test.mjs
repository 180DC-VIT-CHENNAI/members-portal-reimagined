import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

let portal, admin, director, member;
before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture', ENVIRONMENT: 'development' });
  admin = signIn(portal, 'srijan.guchhait@gmail.com');
  for (const [email, role] of [['director@example.com', 'director'], ['member@example.com', 'member']]) {
    const result = await admin.post('/api/people', {
      email, fullName: email, departmentId: 'finance', accessRoleId: role,
    });
    assert.equal(result.status, 201, result.text);
  }
  director = signIn(portal, 'director@example.com');
  member = signIn(portal, 'member@example.com');
});
after(async () => { await portal?.stop(); });
beforeEach(() => {
  portal.db.exec(`DELETE FROM email_queue; DELETE FROM email_deliveries; DELETE FROM dev_outbox;
    DELETE FROM email_hour_count; DELETE FROM daily_email_count; DELETE FROM rate_limits;`);
});

function send(to, subject = 'Test') {
  return admin.post('/api/send-email', { to, subject, body: '<script>alert(1)</script>\nHello' });
}
function campaign(recipients, overrides = {}) {
  const id = crypto.randomUUID();
  portal.db.prepare(`INSERT INTO email_queue
    (id,kind,from_address,subject,html,recipients,total,status,attempts,updated_at)
    VALUES (?, 'custom', '180DC Admin <noreply@180dc.vitcc.org>', 'Queued', '<p>Hello</p>', ?, ?, ?, ?, ?)`)
    .run(id, JSON.stringify(recipients), recipients.length, overrides.status ?? 'pending',
      overrides.attempts ?? 0, overrides.updatedAt ?? '2026-01-01 00:00:00');
  return id;
}
function row(id) { return portal.db.prepare('SELECT * FROM email_queue WHERE id=?').get(id); }
async function outbox() {
  const result = await admin.get('/api/dev/outbox');
  assert.equal(result.status, 200, result.text);
  return result.json.messages;
}

test('mail permissions deny anonymous and ordinary members; directors only send inside permitted departments', async () => {
  assert.equal((await anonymous(portal).get('/api/admin/email-queue')).status, 401);
  assert.equal((await member.get('/api/admin/email-queue')).status, 403);
  assert.equal((await member.post('/api/send-email', { to: 'x@example.com', subject: 's', body: 'b' })).status, 403);
  const result = await director.post('/api/send-email', {
    to: 'member@example.com, external@example.com', subject: 's', body: 'b',
  });
  assert.equal(result.status, 200, result.text);
  assert.equal(result.json.sent, 1);
  assert.deepEqual((await outbox()).map((m) => m.recipient), ['member@example.com']);
  assert.equal((await director.post('/api/send-email', { to: 'external@example.com', subject: 's', body: 'b' })).status, 403);
});

test('ten recipients send directly, deduplicate and escape plain-text body', async () => {
  const recipients = Array.from({ length: 10 }, (_, i) => `p${i}@example.com`);
  const result = await send([...recipients, recipients[0].toUpperCase()].join(','));
  assert.equal(result.status, 200, result.text);
  assert.equal(result.json.sent, 10);
  assert.equal(result.json.queued, 0);
  const messages = await outbox();
  assert.equal(messages.length, 10);
  assert.match(messages[0].html, /&lt;script&gt;/);
  assert.equal(messages[0].fromAddress, '180DC Admin <noreply@180dc.vitcc.org>');
  assert.equal(messages[0].headers['Reply-To'], 'srijan.guchhait@gmail.com');
  assert.equal(portal.db.prepare('SELECT count FROM daily_email_count').get().count, 10);
});

test('eleven recipients queue and an awaited real cron invocation completes the campaign', async () => {
  const result = await send(Array.from({ length: 11 }, (_, i) => `p${i}@example.com`).join(','));
  assert.equal(result.status, 200, result.text);
  assert.equal(result.json.queued, 11);
  assert.ok(result.json.campaignId);
  assert.equal((await outbox()).length, 0);
  // Budget depends on the current minute, but is at least 8 with an empty default counter.
  await portal.runCron();
  await portal.runCron();
  assert.equal(row(result.json.campaignId).status, 'done');
  assert.equal((await outbox()).length, 11);
  await portal.runCron();
  assert.equal((await outbox()).length, 11);
});

test('unverified and unknown-outcome recipients fail without blocking the rest; only the unknown outcome keeps its hourly slot', async () => {
  const id = campaign(['one@unverified.invalid', 'two@unknown.invalid', 'ok@example.com']);
  await portal.runCron();
  assert.equal(row(id).status, 'done');
  assert.equal(row(id).sent, 1);
  assert.equal(row(id).failed, 2);
  const result = await admin.get(`/api/admin/email-queue/${id}/deliveries`);
  assert.equal(result.status, 200, result.text);
  const errors = Object.fromEntries(result.json.deliveries.map((d) => [d.recipient, d.error]));
  assert.match(errors['one@unverified.invalid'], /^UNVERIFIED_DESTINATION/);
  assert.match(errors['two@unknown.invalid'], /^OUTCOME_UNKNOWN/);
  assert.equal(errors['ok@example.com'], null);
  // Cloudflare may have accepted the unknown outcome, so it still counts against the hour.
  assert.equal(portal.db.prepare('SELECT sum(count) AS n FROM email_hour_count').get().n, 2);
});

test('retry-failed skips settled recipients and only retries failure records', async () => {
  const id = campaign(['bad@unverified.invalid', 'ok@example.com']);
  await portal.runCron();
  assert.equal((await admin.post(`/api/admin/email-queue/${id}/retry-failed`, {})).json.retrying, 1);
  await portal.runCron();
  assert.deepEqual((await outbox()).map((m) => m.recipient), ['ok@example.com']);
  const delivery = portal.db.prepare('SELECT attempts FROM email_deliveries WHERE recipient=?').get('bad@unverified.invalid');
  assert.equal(delivery.attempts, 2);
});

test('provider outages pause without advancing and five no-progress claims eventually fail', async () => {
  const id = campaign(['x@upstream.invalid', 'next@example.com']);
  for (let i = 0; i < 6; i++) await portal.runCron();
  assert.equal(row(id).status, 'failed');
  assert.equal(row(id).cursor, 0);
  assert.equal((await outbox()).length, 0);
});

test('provider quota errors pause the cursor and saturate the shared hour counter', async () => {
  const id = campaign(['provider@quota.invalid', 'next@example.com']);
  await portal.runCron();
  assert.equal(row(id).status, 'pending');
  assert.equal(row(id).cursor, 0);
  assert.equal(row(id).failed, 0);
  const hour = new Date().toISOString().slice(0, 13);
  assert.equal(portal.db.prepare('SELECT count FROM email_hour_count WHERE hour=?').get(hour).count, 500);
  assert.equal((await outbox()).length, 0);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM email_deliveries').get().n, 0);
});

test('missing and unreadable attachment references are omitted without aborting the campaign', async () => {
  const id = campaign(['one@example.com']);
  portal.db.prepare('UPDATE email_queue SET attachments=? WHERE id=?').run(JSON.stringify([
    { filename: 'missing.pdf', key: 'not-present.pdf' },
    { filename: 'unreadable.pdf', key: 'x'.repeat(1025) },
  ]), id);
  await portal.runCron();
  assert.equal(row(id).status, 'done');
  assert.equal(row(id).sent, 1);
  assert.deepEqual((await outbox())[0].attachments, []);
});

test('shared hourly quota queues paused direct mail and campaign cutoff leaves the last 10 percent reserved', async () => {
  const hour = new Date().toISOString().slice(0, 13);
  portal.db.prepare('INSERT INTO email_hour_count(hour,count) VALUES (?,500)').run(hour);
  const result = await send('one@example.com');
  assert.equal(result.json.sent, 0);
  assert.equal(result.json.queued, 1);
  await portal.runCron();
  assert.equal((await outbox()).length, 0);
  portal.db.prepare('UPDATE email_hour_count SET count=450 WHERE hour=?').run(hour);
  await portal.runCron();
  assert.equal((await outbox()).length, 0);
  portal.db.prepare('UPDATE email_hour_count SET count=449 WHERE hour=?').run(hour);
  await portal.runCron();
  assert.equal((await outbox()).length, 1);
});

test('concurrent drains claim a campaign once and stale leases can be reclaimed', async () => {
  const id = campaign(['one@example.com']);
  const results = await Promise.all([
    admin.post('/api/dev/drain-email', {}),
    admin.post('/api/dev/drain-email', {}),
  ]);
  assert.ok(results.every((r) => r.status === 200), results.map((r) => r.text).join('\n'));
  assert.equal(row(id).sent, 1);
  assert.equal((await outbox()).length, 1);
  const stale = campaign(['stale@example.com'], { status: 'processing' });
  await portal.runCron();
  assert.equal(row(stale).status, 'done');
});

test('concurrent direct sends atomically reserve the last hourly slot', async () => {
  const hour = new Date().toISOString().slice(0, 13);
  portal.db.prepare('INSERT INTO email_hour_count(hour,count) VALUES (?,499)').run(hour);
  const results = await Promise.all([send('one@example.com'), send('two@example.com')]);
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(results.reduce((sum, result) => sum + result.json.sent, 0), 1);
  assert.equal(results.reduce((sum, result) => sum + result.json.queued, 0), 1);
  assert.equal((await outbox()).length, 1);
  assert.equal(portal.db.prepare('SELECT count FROM email_hour_count WHERE hour=?').get(hour).count, 500);
});

test('queue operations reject missing, active and settled campaigns appropriately', async () => {
  assert.equal((await admin.get('/api/admin/email-queue/missing/deliveries')).status, 404);
  assert.equal((await admin.post('/api/admin/email-queue/missing/retry-failed', {})).status, 404);
  const id = campaign(['one@example.com']);
  assert.equal((await admin.post(`/api/admin/email-queue/${id}/retry-failed`, {})).status, 409);
  await portal.runCron();
  assert.equal((await admin.post(`/api/admin/email-queue/${id}/retry-failed`, {})).status, 400);
  assert.equal((await director.post(`/api/admin/email-queue/${id}/retry-failed`, {})).status, 403);
  const status = await admin.get('/api/admin/email-queue');
  assert.equal(status.status, 200, status.text);
  assert.equal(status.json.hourlyLimit, 500);
  assert.equal(status.json.recent[0].id, id);
});

test('department-scoped queue grants cannot inspect or retry global campaigns', async () => {
  const person = portal.db.prepare('SELECT id FROM people WHERE email=?').get('director@example.com');
  const grants = ['email.view', 'email.manage'].map((permission) => ({ permission, departmentId: 'finance' }));
  const granted = await admin.put(`/api/people/${person.id}/access`, { accessRoleId: 'director', grants });
  assert.equal(granted.status, 200, granted.text);
  const id = campaign(['one@example.com']);
  assert.equal((await director.get('/api/admin/email-queue')).status, 403);
  assert.equal((await director.get(`/api/admin/email-queue/${id}/deliveries`)).status, 403);
  assert.equal((await director.post(`/api/admin/email-queue/${id}/retry-failed`, {})).status, 403);
  assert.equal((await admin.put(`/api/people/${person.id}/access`, { accessRoleId: 'director', grants: [] })).status, 200);
});

test('consulting replies report provider acceptance and send client replies to the deciding admin', async () => {
  const created = await anonymous(portal).post('/api/consulting-request', {
    name: 'Client', email: 'client@example.com', phone: '1234567890', organization: 'Client Org', requirement: 'Help',
  });
  assert.equal(created.status, 201, created.text);
  const request = portal.db.prepare('SELECT id FROM consulting_requests WHERE email=?').get('client@example.com');
  const result = await admin.post(`/api/consulting-requests/${request.id}/accept`, {
    emailSubject: 'Accepted', emailBody: 'Thanks',
  });
  assert.equal(result.status, 200, result.text);
  assert.equal(result.json.emailSent, true);
  const [reply, ...others] = await outbox();
  assert.equal(others.length, 0);
  assert.equal(reply.recipient, 'client@example.com');
  assert.equal(reply.fromAddress, '180DC Consulting <noreply@180dc.vitcc.org>');
  assert.equal(reply.headers['Reply-To'], 'srijan.guchhait@gmail.com');
});
