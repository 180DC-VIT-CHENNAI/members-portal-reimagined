import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

let portal, admin, member, publicClient;
before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, 'srijan.guchhait@gmail.com');
  assert.equal((await admin.post('/api/people', { email: 'reader.member@example.com', fullName: 'Member', departmentId: 'finance' })).status, 201);
  member = signIn(portal, 'reader.member@example.com');
  publicClient = anonymous(portal);
});
after(async () => { await portal?.stop(); });
beforeEach(() => { portal.db.exec('DELETE FROM newsletter_subscribers; DELETE FROM dev_outbox; DELETE FROM email_deliveries; DELETE FROM email_queue; DELETE FROM rate_limits; DELETE FROM email_hour_count;'); });
const outbox = async () => (await admin.get('/api/dev/outbox')).json.messages;
const row = (email) => portal.db.prepare('SELECT * FROM newsletter_subscribers WHERE email = ?').get(email);
async function subscribe(email = 'reader@example.com', name = 'Reader') {
  const response = await publicClient.post('/api/newsletter/subscribe', { email, name });
  assert.equal(response.status, 200, response.text);
  const mail = (await outbox()).at(-1);
  const token = /\/subscriber\?confirm=([a-f0-9]{64})/.exec(mail.html)?.[1];
  assert.ok(token);
  return token;
}
async function confirmed(email = 'reader@example.com') {
  const token = await subscribe(email);
  assert.equal((await publicClient.post('/api/newsletter/confirm', { token })).status, 200);
  return row(email);
}

test('email-only subscription remains pending until confirmation and stores only the hash', async () => {
  const token = await subscribe(' Reader@Example.COM ', '<Reader>');
  const pending = row('reader@example.com');
  assert.equal(pending.status, 'pending');
  assert.equal(pending.confirm_token_hash, createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(pending).includes(token));
  assert.equal((await publicClient.get('/api/newsletter/subscribers/count')).json.count, 0);
  const result = await publicClient.post('/api/newsletter/confirm', { token });
  assert.deepEqual(result.json, { confirmed: true, welcomeBack: false });
  const active = row('reader@example.com');
  assert.equal(active.status, 'active');
  assert.equal(active.confirm_token_hash, null);
  assert.equal((await publicClient.get('/api/newsletter/subscribers/count')).json.count, 1);
  const mail = (await outbox()).at(-1);
  assert.equal(mail.headers['List-Unsubscribe'], `<${portal.base}/api/newsletter/unsubscribe/${active.unsubscribe_token}>`);
  assert.equal(mail.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.ok(mail.html.includes('/unsubscribe/' + active.unsubscribe_token));
});

test('an active address gets the same pending response without changing its name or sending another email', async () => {
  await confirmed();
  const count = (await outbox()).length;
  const repeated = await publicClient.post('/api/newsletter/subscribe', { email: 'READER@example.com', name: 'Different' });
  assert.deepEqual(repeated.json, { pending: true });
  assert.equal(row('reader@example.com').name, 'Reader');
  assert.equal((await outbox()).length, count);
});

test('a confirmation credential has exactly one winner under concurrent requests', async () => {
  const token = await subscribe();
  const results = await Promise.all([1, 2].map(() => publicClient.post('/api/newsletter/confirm', { token })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  assert.equal((await outbox()).length, 2);
  assert.equal((await publicClient.post('/api/newsletter/confirm', { token })).status, 400);
});

test('expired and replaced confirmation links cannot activate a subscription', async () => {
  const old = await subscribe();
  const replacement = await subscribe();
  assert.equal((await publicClient.post('/api/newsletter/confirm', { token: old })).status, 400);
  portal.db.prepare("UPDATE newsletter_subscribers SET confirm_expires_at = '2000-01-01T00:00:00.000Z'").run();
  assert.equal((await publicClient.post('/api/newsletter/confirm', { token: replacement })).status, 400);
  assert.equal(row('reader@example.com').status, 'pending');
});

test('only POST with the personal token unsubscribes, including mail-provider one-click without Origin', async () => {
  const saved = await confirmed();
  assert.equal((await publicClient.get('/api/newsletter/unsubscribe/' + saved.unsubscribe_token)).status, 404);
  assert.equal(row(saved.email).status, 'active');
  const response = await fetch(portal.base + '/api/newsletter/unsubscribe/' + saved.unsubscribe_token, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click',
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'unsubscribed');
  assert.equal((await publicClient.post('/api/newsletter/unsubscribe/' + saved.unsubscribe_token)).json.status, 'already');
  assert.equal((await publicClient.post('/api/newsletter/unsubscribe/' + '0'.repeat(48))).json.status, 'not_found');
  assert.equal((await publicClient.post('/api/newsletter/unsubscribe/bad')).status, 400);
});

test('cross-site forms cannot unsubscribe even with a token', async () => {
  const saved = await confirmed();
  const response = await fetch(portal.base + '/api/newsletter/unsubscribe/' + saved.unsubscribe_token, { method: 'POST', headers: { origin: 'https://attacker.example' } });
  assert.equal(response.status, 403);
  assert.equal(row(saved.email).status, 'active');
});

test('resubscription requires confirming again and preserves the personal unsubscribe token', async () => {
  const first = await confirmed();
  await publicClient.post('/api/newsletter/unsubscribe/' + first.unsubscribe_token);
  const token = await subscribe();
  assert.equal(row(first.email).status, 'pending');
  assert.deepEqual((await publicClient.post('/api/newsletter/confirm', { token })).json, { confirmed: true, welcomeBack: true });
  assert.equal(row(first.email).unsubscribe_token, first.unsubscribe_token);
});

test('an email-entry unsubscribe request sends a link but never changes the subscription or enumerates addresses', async () => {
  const saved = await confirmed();
  const actual = await publicClient.post('/api/newsletter/unsubscribe-link', { email: saved.email });
  const absent = await publicClient.post('/api/newsletter/unsubscribe-link', { email: 'missing@example.com' });
  assert.deepEqual(actual.json, { requested: true });
  assert.deepEqual(absent.json, actual.json);
  assert.equal(row(saved.email).status, 'active');
  assert.ok((await outbox()).at(-1).html.includes('/unsubscribe/' + saved.unsubscribe_token));
});

test('subscriber administration is global-permission protected and never exposes credentials', async () => {
  await confirmed();
  assert.equal((await publicClient.get('/api/newsletter/subscribers')).status, 401);
  assert.equal((await member.get('/api/newsletter/subscribers')).status, 403);
  const response = await admin.get('/api/newsletter/subscribers');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /(?:^|,\s*)no-store(?:,|$)/);
  assert.equal(response.json.length, 1);
  assert.ok(!JSON.stringify(response.json).includes('Token'));
  assert.ok(!JSON.stringify(response.json).includes('token'));
});

test('erasure and its audit either both commit or neither does', async () => {
  const saved = await confirmed();
  assert.equal((await member.del('/api/newsletter/subscribers/' + saved.id)).status, 403);
  portal.db.exec("CREATE TRIGGER refuse_subscriber_audit BEFORE INSERT ON audit_log WHEN NEW.action = 'newsletter.subscriber.erase' BEGIN SELECT RAISE(ABORT, 'injected'); END;");
  try { assert.equal((await admin.del('/api/newsletter/subscribers/' + saved.id)).status, 500); }
  finally { portal.db.exec('DROP TRIGGER refuse_subscriber_audit;'); }
  assert.ok(row(saved.email));
  assert.equal((await admin.del('/api/newsletter/subscribers/' + saved.id)).status, 200);
  assert.equal(row(saved.email), undefined);
  const audit = portal.db.prepare("SELECT * FROM audit_log WHERE action = 'newsletter.subscriber.erase' AND target_id = ?").get(saved.id);
  assert.ok(audit);
  assert.ok(!JSON.stringify(audit).includes(saved.email));
  assert.equal((await admin.del('/api/newsletter/subscribers/' + saved.id)).status, 404);
});

test('public input boundaries and the five-per-hour subscription limit are enforced', async () => {
  assert.equal((await publicClient.post('/api/newsletter/subscribe', { email: 'invalid' })).status, 400);
  for (let i = 0; i < 5; i++) assert.equal((await publicClient.post('/api/newsletter/subscribe', { email: `pending${i}@example.com` })).status, 200);
  const limited = await publicClient.post('/api/newsletter/subscribe', { email: 'too.many@example.com' });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('temporary mail pauses queue the confirmation instead of silently losing it', async () => {
  portal.db.prepare('INSERT INTO email_hour_count (hour, count) VALUES (?, 500)').run(new Date().toISOString().slice(0, 13));
  assert.deepEqual((await publicClient.post('/api/newsletter/subscribe', { email: 'later@example.com' })).json, { pending: true });
  const campaign = portal.db.prepare("SELECT * FROM email_queue WHERE kind = 'subscription'").get();
  assert.ok(campaign);
  assert.deepEqual(JSON.parse(campaign.recipients), ['later@example.com']);
  assert.equal((await outbox()).length, 0);
});
