import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

let portal, admin, manager, viewer, drafter, reviewer, outsider;
const ids = {};
const draftBody = { to: ['client@example.org'], cc: [], bcc: ['archive@example.org'], subject: 'Client update', text: 'A reviewed response', attachmentIds: [] };
const reader = ['mailbox.read'];
const drafting = [...reader, 'mailbox.draft.create', 'mailbox.draft.edit_own', 'mailbox.draft.submit'];
const reviewing = [...reader, 'mailbox.review', 'mailbox.approve', 'mailbox.send'];

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, 'srijan.guchhait@gmail.com');
  for (const name of ['manager', 'viewer', 'drafter', 'reviewer', 'outsider']) {
    const invited = await admin.post('/api/people', { email: `mail.${name}@example.org`, fullName: name, departmentId: 'finance' });
    assert.equal(invited.status, 201, invited.text);
    ids[name] = invited.json.id;
  }
  manager = signIn(portal, 'mail.manager@example.org');
  viewer = signIn(portal, 'mail.viewer@example.org');
  drafter = signIn(portal, 'mail.drafter@example.org');
  reviewer = signIn(portal, 'mail.reviewer@example.org');
  outsider = signIn(portal, 'mail.outsider@example.org');
});
after(async () => { await portal?.stop(); });
// Each scenario owns its request budget; production rate limits remain enabled.
beforeEach(() => { portal.db.prepare('DELETE FROM rate_limits').run(); });

async function createMailbox() {
  const created = await admin.post('/api/mailboxes', {
    address: `technical-${randomUUID()}@example.org`, displayName: 'Technical', managerId: ids.manager,
  });
  assert.equal(created.status, 201, created.text);
  const id = created.json.id;
  for (const [who, capabilities] of [['manager', ['mailbox.manage', ...reader]], ['viewer', reader], ['drafter', drafting], ['reviewer', reviewing]]) {
    const granted = await admin.put(`/api/mailboxes/${id}/members/${ids[who]}`, { capabilities });
    assert.equal(granted.status, 200, granted.text);
  }
  const configured = await manager.patch(`/api/mailboxes/${id}`, { outboundAdapter: 'capture', repliesOnly: false });
  assert.equal(configured.status, 200, configured.text);
  return id;
}

async function createDraft(mailbox, body = draftBody) {
  const res = await drafter.post(`/api/mailboxes/${mailbox}/drafts`, body);
  assert.equal(res.status, 201, res.text);
  return res.json.id;
}
async function approve(mailbox, draft, revision = 1) {
  const submitted = await drafter.post(`/api/mailboxes/${mailbox}/drafts/${draft}/submit`, { revision });
  assert.equal(submitted.status, 200, submitted.text);
  const approved = await reviewer.post(`/api/mailboxes/${mailbox}/drafts/${draft}/review`, { revision, decision: 'approved' });
  assert.equal(approved.status, 200, approved.text);
}
async function queue(mailbox, draft, overrides = {}) {
  const sent = await reviewer.post(`/api/mailboxes/${mailbox}/drafts/${draft}/send`, { revision: 1, idempotencyKey: randomUUID(), ...overrides });
  assert.equal(sent.status, 200, sent.text);
  return sent.json.id;
}
function captured(mailbox) {
  return portal.db.prepare('SELECT * FROM dev_outbox WHERE from_address=(SELECT address FROM mailboxes WHERE id=?)').all(mailbox);
}

test('mailboxes require a session and platform administration never implies inbox visibility', async () => {
  const mailbox = await createMailbox();
  assert.equal((await anonymous(portal).get('/api/mailboxes')).status, 401);
  assert.equal((await admin.get(`/api/mailboxes/${mailbox}`)).status, 404);
  assert.equal((await admin.get('/api/mailboxes')).json.mailboxes.some((m) => m.mailbox.id === mailbox), false);
  assert.equal((await manager.put(`/api/mailboxes/${mailbox}/members/${ids.manager}`, { capabilities: reviewing })).status, 403);
  const mine = portal.db.prepare("SELECT id FROM people WHERE email='srijan.guchhait@gmail.com'").get().id;
  assert.equal((await admin.post('/api/mailboxes', { address: 'self@example.org', displayName: 'Self', managerId: mine })).status, 403);
});

test('viewer can read but cannot draft, submit, review, approve, send, cancel or manage', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  const path = `/api/mailboxes/${mailbox}/drafts/${draft}`;
  assert.equal((await viewer.get(path)).status, 200);
  assert.equal((await viewer.post(`/api/mailboxes/${mailbox}/drafts`, draftBody)).status, 403);
  assert.equal((await viewer.patch(path, { ...draftBody, revision: 1 })).status, 403);
  assert.equal((await viewer.post(`${path}/submit`, { revision: 1 })).status, 403);
  assert.equal((await viewer.post(`${path}/review`, { revision: 1, decision: 'approved' })).status, 403);
  assert.equal((await viewer.post(`${path}/send`, { revision: 1, idempotencyKey: randomUUID() })).status, 403);
  assert.equal((await viewer.del(path)).status, 403);
  assert.equal((await viewer.patch(`/api/mailboxes/${mailbox}`, { outboundPaused: true })).status, 403);
});

test('outsiders cannot discover mailbox contents, attachment IDs, send status or audit', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  assert.equal((await outsider.get('/api/mailboxes')).json.mailboxes.length, 0);
  for (const suffix of ['', '/drafts', `/drafts/${draft}`, '/attachments/guess', '/sends/guess', '/audit', '/members']) {
    assert.equal((await outsider.get(`/api/mailboxes/${mailbox}${suffix}`)).status, 404, suffix);
  }
});

test('drafter cannot approve or send through the mailbox or the global email route', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  const path = `/api/mailboxes/${mailbox}/drafts/${draft}`;
  assert.equal((await drafter.post(`${path}/review`, { revision: 1, decision: 'approved' })).status, 403);
  assert.equal((await drafter.post(`${path}/send`, { revision: 1, idempotencyKey: randomUUID() })).status, 403);
  assert.equal((await drafter.post('/api/send-email', { to: 'client@example.org', subject: 'Bypass', body: 'Must not send' })).status, 403);
  assert.equal((await drafter.post('/api/mailboxes/jobs', {})).status, 404);
  assert.equal(captured(mailbox).length, 0);
});

test('review binds the complete snapshot; an idempotent intent dispatches only once from the shared address', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  await approve(mailbox, draft);
  const key = randomUUID();
  const intent = await queue(mailbox, draft, { idempotencyKey: key });
  const replay = await reviewer.post(`/api/mailboxes/${mailbox}/drafts/${draft}/send`, { revision: 1, idempotencyKey: key });
  assert.equal(replay.status, 200, replay.text);
  assert.equal(replay.json.id, intent);
  await portal.runCron();
  await portal.runCron();
  const status = await reviewer.get(`/api/mailboxes/${mailbox}/sends/${intent}`);
  assert.equal(status.json.intent.state, 'accepted', status.text);
  assert.equal(status.json.attempts.length, 1);
  assert.equal(captured(mailbox).length, 2, 'To and BCC are each delivered once');
  assert.equal(captured(mailbox).some((m) => m.recipient === 'archive@example.org'), true);
  assert.equal(status.json.intent.state === 'delivered', false);
});

test('editing queued content invalidates approval, cancels the old intent and preserves the frozen revision', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  await approve(mailbox, draft);
  const intent = await queue(mailbox, draft);
  const changed = await drafter.patch(`/api/mailboxes/${mailbox}/drafts/${draft}`, { ...draftBody, to: ['new-client@example.org'], revision: 1 });
  assert.equal(changed.status, 200, changed.text);
  assert.equal(changed.json.revision, 2);
  assert.equal((await reviewer.post(`/api/mailboxes/${mailbox}/drafts/${draft}/send`, { revision: 2, idempotencyKey: randomUUID() })).status, 409);
  await portal.runCron();
  assert.equal(captured(mailbox).length, 0);
  assert.equal((await reviewer.get(`/api/mailboxes/${mailbox}/sends/${intent}`)).json.intent.state, 'cancelled');
  const old = portal.db.prepare('SELECT recipients FROM mail_draft_snapshots WHERE draft_id=? AND revision=1').get(draft);
  assert.deepEqual(JSON.parse(old.recipients).to, draftBody.to);
});

test('revoking an approver before scheduled dispatch prevents the send', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  await approve(mailbox, draft);
  const intent = await queue(mailbox, draft, { scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
  assert.equal((await admin.put(`/api/mailboxes/${mailbox}/members/${ids.reviewer}`, { capabilities: reader })).status, 200);
  portal.db.prepare("UPDATE mail_send_intents SET due_at='2000-01-01T00:00:00Z' WHERE id=?").run(intent);
  await portal.runCron();
  assert.equal(captured(mailbox).length, 0);
  assert.equal(portal.db.prepare('SELECT state FROM mail_send_intents WHERE id=?').get(intent).state, 'cancelled');
});

test('the emergency outbound switch pauses dispatch without consuming an intent', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  await approve(mailbox, draft);
  const intent = await queue(mailbox, draft);
  assert.equal((await admin.put('/api/admin/mail-outbound', { paused: true })).status, 200);
  await portal.runCron();
  assert.equal(captured(mailbox).length, 0);
  assert.equal(portal.db.prepare('SELECT state FROM mail_send_intents WHERE id=?').get(intent).state, 'queued');
  assert.equal((await admin.put('/api/admin/mail-outbound', { paused: false })).status, 200);
  await portal.runCron();
  assert.equal(captured(mailbox).length, 2);
});

test('ambiguous acceptance is never automatically replayed', async () => {
  const mailbox = await createMailbox();
  const draft = await createDraft(mailbox, { ...draftBody, to: ['client@unknown.invalid'], bcc: [] });
  await approve(mailbox, draft);
  const intent = await queue(mailbox, draft);
  await portal.runCron();
  await portal.runCron();
  const status = await reviewer.get(`/api/mailboxes/${mailbox}/sends/${intent}`);
  assert.equal(status.json.intent.state, 'outcome_unknown', status.text);
  assert.equal(status.json.attempts.length, 1);
  assert.equal(captured(mailbox).length, 0);
  assert.equal((await drafter.patch(`/api/mailboxes/${mailbox}/drafts/${draft}`, { ...draftBody, revision: 1 })).status, 409);
});

test('attachments are mailbox-scoped and a changed frozen snapshot prevents dispatch', async () => {
  const mailbox = await createMailbox(), other = await createMailbox();
  const uploaded = await drafter.upload(`/api/mailboxes/${mailbox}/attachments`, { file: { name: 'report.txt', type: 'text/plain', data: 'approved attachment' } });
  assert.equal(uploaded.status, 201, uploaded.text);
  assert.equal((await outsider.get(`/api/mailboxes/${mailbox}/attachments/${uploaded.json.id}`)).status, 404);
  assert.equal((await drafter.get(`/api/mailboxes/${other}/attachments/${uploaded.json.id}`)).status, 404);
  assert.equal((await drafter.post(`/api/mailboxes/${other}/drafts`, { ...draftBody, attachmentIds: [uploaded.json.id] })).status, 400);
  const draft = await createDraft(mailbox, { ...draftBody, attachmentIds: [uploaded.json.id] });
  await approve(mailbox, draft);
  const intent = await queue(mailbox, draft);
  // Change the frozen manifest to emulate a corrupt stored snapshot; dispatch must refuse it.
  portal.db.prepare("UPDATE mail_draft_snapshots SET text='tampered' WHERE draft_id=?").run(draft);
  await portal.runCron();
  assert.equal(captured(mailbox).length, 0);
  assert.equal(portal.db.prepare('SELECT state FROM mail_send_intents WHERE id=?').get(intent).state, 'cancelled');
});

test('approved private attachment bytes are loaded and included in the captured send', async () => {
  const mailbox = await createMailbox();
  const uploaded = await drafter.upload(`/api/mailboxes/${mailbox}/attachments`, { file: { name: 'approved.txt', type: 'text/plain', data: 'approved bytes' } });
  assert.equal(uploaded.status, 201, uploaded.text);
  const draft = await createDraft(mailbox, { ...draftBody, bcc: [], attachmentIds: [uploaded.json.id] });
  await approve(mailbox, draft);
  await queue(mailbox, draft);
  await portal.runCron();
  const messages = captured(mailbox);
  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(messages[0].attachments), ['approved.txt']);
});

test('an interrupted send becomes uncertain without making a second provider attempt', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  await approve(mailbox, draft);
  const intent = await queue(mailbox, draft);
  portal.db.prepare("UPDATE mail_send_intents SET state='sending',claim_token='lost',claimed_at='2000-01-01T00:00:00Z',attempt_count=1 WHERE id=?").run(intent);
  portal.db.prepare("UPDATE mail_drafts SET state='sending' WHERE id=?").run(draft);
  portal.db.prepare("INSERT INTO mail_send_attempts(id,intent_id,attempt_no,provider,outcome,created_at) VALUES (?, ?, 1, 'capture','started','2000-01-01T00:00:00Z')").run(randomUUID(), intent);
  await portal.runCron();
  await portal.runCron();
  const status = await reviewer.get(`/api/mailboxes/${mailbox}/sends/${intent}`);
  assert.equal(status.json.intent.state, 'outcome_unknown', status.text);
  assert.equal(status.json.attempts.length, 1);
  assert.equal(status.json.attempts[0].outcome, 'outcome_unknown');
  assert.equal(captured(mailbox).length, 0);
});

test('mailbox creation remains rate limited even for a platform administrator', async () => {
  for (let i = 0; i < 20; i++) {
    assert.equal((await admin.post('/api/mailboxes', { address: `rate-${i}@example.org`, displayName: 'Rate limit', managerId: ids.manager })).status, 201);
  }
  assert.equal((await admin.post('/api/mailboxes', { address: 'rate-over@example.org', displayName: 'Rate limit', managerId: ids.manager })).status, 429);
});

test('Cloudflare transport cannot be used for unthreaded outreach or forged From/conversation fields', async () => {
  const mailbox = await createMailbox();
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/drafts`, { ...draftBody, fromAddress: 'forged@example.org' })).status, 400);
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/drafts`, { ...draftBody, conversationId: 'forged' })).status, 400);
  const draft = await createDraft(mailbox);
  assert.equal((await manager.patch(`/api/mailboxes/${mailbox}`, { outboundAdapter: 'cloudflare', repliesOnly: true })).status, 200);
  await approve(mailbox, draft);
  const intent = await queue(mailbox, draft);
  await portal.runCron();
  assert.equal(captured(mailbox).length, 0);
  assert.equal(portal.db.prepare('SELECT state FROM mail_send_intents WHERE id=?').get(intent).state, 'cancelled');
});

test('a broadly privileged drafter still cannot approve their own snapshot', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  const granted = await admin.put(`/api/mailboxes/${mailbox}/members/${ids.drafter}`, { capabilities: [...new Set([...drafting, ...reviewing])] });
  assert.equal(granted.status, 200, granted.text);
  const path = `/api/mailboxes/${mailbox}/drafts/${draft}`;
  assert.equal((await drafter.post(`${path}/submit`, { revision: 1 })).status, 200);
  assert.equal((await drafter.post(`${path}/review`, { revision: 1, decision: 'approved' })).status, 403);
});

test('concurrent edits cannot silently overwrite each other', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  const path = `/api/mailboxes/${mailbox}/drafts/${draft}`;
  const results = await Promise.all([
    drafter.patch(path, { ...draftBody, text: 'First edit', revision: 1 }),
    drafter.patch(path, { ...draftBody, text: 'Second edit', revision: 1 }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const loaded = await drafter.get(path);
  assert.equal(loaded.json.draft.revision, 2);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM mail_draft_snapshots WHERE draft_id=?').get(draft).n, 2);
});

test('concurrent send requests cannot create two automatic dispatches', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  await approve(mailbox, draft);
  const path = `/api/mailboxes/${mailbox}/drafts/${draft}/send`;
  const results = await Promise.all([
    reviewer.post(path, { revision: 1, idempotencyKey: randomUUID() }),
    reviewer.post(path, { revision: 1, idempotencyKey: randomUUID() }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  await portal.runCron();
  assert.equal(captured(mailbox).length, 2);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM mail_send_attempts WHERE intent_id IN (SELECT id FROM mail_send_intents WHERE draft_id=?)').get(draft).n, 1);
});

test('retiring the mailbox after approval blocks a pending dispatch', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  await approve(mailbox, draft);
  const intent = await queue(mailbox, draft);
  assert.equal((await manager.patch(`/api/mailboxes/${mailbox}`, { status: 'retired' })).status, 200);
  await portal.runCron();
  assert.equal(captured(mailbox).length, 0);
  assert.equal(portal.db.prepare('SELECT state FROM mail_send_intents WHERE id=?').get(intent).state, 'cancelled');
});

test('mixed definitive and uncertain recipient failures retain an uncertain send outcome', async () => {
  const mailbox = await createMailbox();
  const draft = await createDraft(mailbox, {
    ...draftBody, to: ['first@unverified.invalid', 'second@unknown.invalid'], bcc: [],
  });
  await approve(mailbox, draft);
  const intent = await queue(mailbox, draft);
  await portal.runCron();
  const status = await reviewer.get(`/api/mailboxes/${mailbox}/sends/${intent}`);
  assert.equal(status.json.intent.state, 'outcome_unknown', status.text);
  assert.equal(captured(mailbox).length, 0);
});

async function inviteMailUser(name) {
  const invited = await admin.post('/api/people', { email: `mail.${name}@example.org`, fullName: name, departmentId: 'finance' });
  assert.equal(invited.status, 201, invited.text);
  return { id: invited.json.id, client: signIn(portal, `mail.${name}@example.org`) };
}

test('offboarding removes mailbox capabilities with an audit entry; a reinstated person still gets 404', async () => {
  const mailbox = await createMailbox();
  const leaver = await inviteMailUser(`leaver-${randomUUID()}`);
  assert.equal((await admin.put(`/api/mailboxes/${mailbox}/members/${leaver.id}`, { capabilities: drafting })).status, 200);
  assert.equal((await leaver.client.get(`/api/mailboxes/${mailbox}`)).status, 200);
  const offboarded = await admin.post(`/api/people/${leaver.id}/offboard`, { status: 'removed', reason: 'Left the club' });
  assert.equal(offboarded.status, 200, offboarded.text);
  assert.equal(offboarded.json.summary.mailboxes, drafting.length);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM mailbox_memberships WHERE person_id=?').get(leaver.id).n, 0);
  assert.equal(portal.db.prepare("SELECT count(*) AS n FROM mail_audit WHERE mailbox_id=? AND action='mailbox.offboard' AND target_id=?").get(mailbox, leaver.id).n, 1);
  assert.equal((await leaver.client.get(`/api/mailboxes/${mailbox}`)).status, 401);
  const again = await admin.post(`/api/people/${leaver.id}/offboard`, { status: 'removed', reason: 'Left the club' });
  assert.equal(again.json.changed, false, again.text);
  assert.equal((await admin.post(`/api/people/${leaver.id}/status`, { status: 'active', reason: 'Rejoined' })).status, 200);
  const rejoined = signIn(portal, `${portal.db.prepare('SELECT email FROM people WHERE id=?').get(leaver.id).email}`);
  assert.equal((await rejoined.get(`/api/mailboxes/${mailbox}`)).status, 404);
  assert.equal((await rejoined.get('/api/mailboxes')).json.mailboxes.length, 0);
});

test('a scheduled send approved by someone later offboarded is not dispatched', async () => {
  const mailbox = await createMailbox(), draft = await createDraft(mailbox);
  const approver = await inviteMailUser(`approver-${randomUUID()}`);
  assert.equal((await admin.put(`/api/mailboxes/${mailbox}/members/${approver.id}`, { capabilities: reviewing })).status, 200);
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/drafts/${draft}/submit`, { revision: 1 })).status, 200);
  const approved = await approver.client.post(`/api/mailboxes/${mailbox}/drafts/${draft}/review`, { revision: 1, decision: 'approved' });
  assert.equal(approved.status, 200, approved.text);
  const sent = await approver.client.post(`/api/mailboxes/${mailbox}/drafts/${draft}/send`, {
    revision: 1, idempotencyKey: randomUUID(), scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  assert.equal(sent.status, 200, sent.text);
  const offboarded = await admin.post(`/api/people/${approver.id}/offboard`, { status: 'alumni', reason: 'Graduated' });
  assert.equal(offboarded.status, 200, offboarded.text);
  portal.db.prepare("UPDATE mail_send_intents SET due_at='2000-01-01T00:00:00Z' WHERE id=?").run(sent.json.id);
  await portal.runCron();
  assert.equal(captured(mailbox).length, 0);
  const intent = portal.db.prepare('SELECT state, last_error FROM mail_send_intents WHERE id=?').get(sent.json.id);
  assert.deepEqual({ ...intent }, { state: 'cancelled', last_error: 'AUTHORIZATION_CHANGED' });
});
