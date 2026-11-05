import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

// Smoke coverage for the GitHub integration with no GitHub App configured and no network: the migration, seeded
// permissions, the webhook gate and the routes' access rules. Behaviour against GitHub fixtures is a recorded gap
// in docs/execution/portal-github-coverage.md.
const ADMIN = 'srijan.guchhait@gmail.com';
const SECRET = 'e2e-webhook-secret';
let portal;
let admin;
let member;

before(async () => {
  portal = await startPortal({ GITHUB_WEBHOOK_SECRET: SECRET });
  admin = signIn(portal, ADMIN);
  const invited = await admin.post('/api/people', { email: 'gh.member@example.com', fullName: 'GH Member', departmentId: 'finance' });
  assert.equal(invited.status, 201, invited.text);
  member = signIn(portal, 'gh.member@example.com');
});
after(async () => {
  await portal?.stop();
});

function deliver(event, payload, { id = `delivery-${Math.random().toString(36).slice(2)}`, secret = SECRET, signature } = {}) {
  const body = JSON.stringify(payload);
  const sig = signature ?? `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  return fetch(`${portal.base}/api/github/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-github-event': event, 'x-github-delivery': id, 'x-hub-signature-256': sig },
    body,
  });
}

test('the migration seeds the GitHub permissions', () => {
  const rows = portal.db.prepare("SELECT role_id, permission, scope FROM role_permissions WHERE permission LIKE 'github.%' ORDER BY role_id, permission").all();
  assert.deepEqual(
    rows.map((r) => `${r.role_id}:${r.permission}:${r.scope}`),
    ['admin:github.issues.write:global', 'admin:github.manage:global', 'director:github.issues.write:department', 'member:github.issues.write:department'],
  );
});

test('admin routes need github.manage and report an unconfigured App', async () => {
  assert.equal((await anonymous(portal).get('/api/github/status')).status, 401);
  assert.equal((await member.get('/api/github/status')).status, 403);
  assert.equal((await member.get('/api/github/repositories')).status, 403);
  const status = await admin.get('/api/github/status');
  assert.equal(status.status, 200, status.text);
  assert.equal(status.json.configured.app, false);
  assert.equal(status.json.configured.webhook, true);
  assert.equal((await admin.post('/api/github/installations/sync')).status, 503);
});

test('member reads are empty and unknown projects or issues are 404', async () => {
  const mine = await member.get('/api/github/my-work');
  assert.equal(mine.status, 200, mine.text);
  const me = await member.get('/api/github/me');
  assert.equal(me.status, 200, me.text);
  const notices = await member.get('/api/github/notifications');
  assert.equal(notices.status, 200, notices.text);
  assert.equal(notices.json.unread, 0);
  assert.equal((await member.get('/api/github/projects/missing/board')).status, 404);
  assert.equal((await member.get('/api/github/issues/1-1')).status, 404);
  assert.equal((await anonymous(portal).get('/api/github/my-work')).status, 401);
});

test('the webhook rejects bad signatures and records deliveries once', async () => {
  const forged = await deliver('ping', { zen: 'x' }, { secret: 'not-the-secret' });
  assert.equal(forged.status, 401);
  assert.equal((await deliver('ping', { zen: 'x' }, { signature: 'sha256=abc' })).status, 401);

  const first = await deliver('ping', { zen: 'x' }, { id: 'smoke-ping-1' });
  const firstText = await first.text();
  assert.equal(first.status, 200, firstText);
  assert.equal(JSON.parse(firstText).status, 'ignored');
  const replay = await deliver('ping', { zen: 'x' }, { id: 'smoke-ping-1' });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).status, 'duplicate');
  const row = portal.db.prepare("SELECT event, status FROM github_webhook_deliveries WHERE id = 'smoke-ping-1'").get();
  assert.equal(row.event, 'ping');
  assert.equal(row.status, 'ignored');

  const listed = await admin.get('/api/github/deliveries');
  assert.equal(listed.status, 200, listed.text);
  assert.ok(JSON.stringify(listed.json).includes('smoke-ping-1'));
});

test('the sync cron runs without a configured App', async () => {
  await portal.runCron('*/10 * * * *');
});

test('GitHub notices join the notification badge count only when present', async () => {
  const count = await member.get('/api/notifications/count');
  assert.equal(count.status, 200, count.text);
  assert.equal(count.json.unread, 0);
});
