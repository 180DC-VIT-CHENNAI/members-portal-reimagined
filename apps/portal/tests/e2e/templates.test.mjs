import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

let portal, admin, manager, viewer, drafter, reviewer, outsider;
const ids = {};
const reader = ['mailbox.read'];
const drafting = [...reader, 'mailbox.draft.create', 'mailbox.draft.edit_own', 'mailbox.draft.submit'];
const reviewing = [...reader, 'mailbox.review', 'mailbox.approve', 'mailbox.send'];

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, 'srijan.guchhait@gmail.com');
  for (const name of ['manager', 'viewer', 'drafter', 'reviewer', 'outsider']) {
    const invited = await admin.post('/api/people', { email: `tmpl.${name}@example.org`, fullName: `Tmpl ${name}`, departmentId: 'finance' });
    assert.equal(invited.status, 201, invited.text);
    ids[name] = invited.json.id;
  }
  manager = signIn(portal, 'tmpl.manager@example.org');
  viewer = signIn(portal, 'tmpl.viewer@example.org');
  drafter = signIn(portal, 'tmpl.drafter@example.org');
  reviewer = signIn(portal, 'tmpl.reviewer@example.org');
  outsider = signIn(portal, 'tmpl.outsider@example.org');
});
after(async () => { await portal?.stop(); });
beforeEach(() => { portal.db.prepare('DELETE FROM rate_limits').run(); });

async function createMailbox() {
  const created = await admin.post('/api/mailboxes', { address: `outreach-${randomUUID()}@example.org`, displayName: 'Outreach', managerId: ids.manager });
  assert.equal(created.status, 201, created.text);
  const id = created.json.id;
  for (const [who, capabilities] of [['manager', ['mailbox.manage', ...reader]], ['viewer', reader], ['drafter', drafting], ['reviewer', reviewing]]) {
    assert.equal((await admin.put(`/api/mailboxes/${id}/members/${ids[who]}`, { capabilities })).status, 200);
  }
  assert.equal((await manager.patch(`/api/mailboxes/${id}`, { outboundAdapter: 'capture', repliesOnly: false })).status, 200);
  return id;
}

const definition = (mailbox, extra = {}) => ({
  fields: [
    { key: 'org_name', label: 'Organisation', type: 'short', required: true, example: 'Acme Trust' },
    { key: 'meet_on', label: 'Meeting date', type: 'date', example: '2026-11-01' },
  ],
  subject: 'Meeting with {{org_name}}',
  body: 'Dear {{org_name}},\nCould we meet on {{meet_on}}?\n{{member_name}}',
  signature: '{{club_name}}',
  allowedMailboxIds: [mailbox],
  ...extra,
});

async function createTemplate(mailbox, extra = {}, client = manager) {
  const created = await client.post('/api/email-templates', { name: 'Meeting proposal', ownerScope: 'mailbox', ownerId: mailbox, definition: definition(mailbox, extra) });
  assert.equal(created.status, 201, created.text);
  return created.json;
}
async function publish(template, version = 1) {
  const res = await manager.post(`/api/email-templates/${template}/status`, { version, action: 'publish' });
  assert.equal(res.status, 200, res.text);
}
const values = { org_name: 'Acme <b>Trust</b>', meet_on: '2026-11-03' };
async function draftFrom(mailbox, versionId, to = ['client@example.org']) {
  const res = await drafter.post(`/api/mailboxes/${mailbox}/templates/drafts`, { versionId, values, to });
  assert.equal(res.status, 201, res.text);
  return res.json.id;
}
const captured = (mailbox) => portal.db.prepare('SELECT * FROM dev_outbox WHERE from_address=(SELECT address FROM mailboxes WHERE id=?)').all(mailbox);

test('a published mailbox template renders safely, pins its version and sends the frozen snapshot', async () => {
  const mailbox = await createMailbox();
  const { id, versionId } = await createTemplate(mailbox);
  assert.equal((await drafter.get(`/api/mailboxes/${mailbox}/templates`)).json.templates.length, 0, 'drafts are not offered before publishing');
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/templates/drafts`, { versionId, values, to: ['client@example.org'] })).status, 409);
  await publish(id);
  const usable = (await drafter.get(`/api/mailboxes/${mailbox}/templates`)).json.templates;
  assert.deepEqual(usable.map((t) => t.versionId), [versionId]);

  const preview = await drafter.post(`/api/mailboxes/${mailbox}/templates/preview`, { versionId, values, to: ['client@example.org'] });
  assert.equal(preview.status, 200, preview.text);
  assert.equal(preview.json.subject, 'Meeting with Acme <b>Trust</b>');
  assert.equal(preview.json.html.includes('<b>'), false, 'values are escaped in HTML');
  assert.equal(preview.json.text.endsWith('Tmpl drafter'), true, 'trusted member name is filled automatically');
  assert.deepEqual(preview.json.warnings, []);
  const missing = await drafter.post(`/api/mailboxes/${mailbox}/templates/preview`, { versionId, values: {}, to: [] });
  assert.deepEqual(missing.json.warnings, ['Required field: Organisation', 'Choose at least one recipient']);
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/templates/drafts`, { versionId, values: {}, to: ['client@example.org'] })).status, 400);

  const draft = await draftFrom(mailbox, versionId);
  const snapshot = portal.db.prepare('SELECT * FROM mail_draft_snapshots WHERE draft_id=?').get(draft);
  assert.equal(snapshot.template_version_id, versionId);
  assert.equal(snapshot.signature, '180 Degrees Consulting VIT Chennai');
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/drafts/${draft}/submit`, { revision: 1 })).status, 200);
  assert.equal((await reviewer.post(`/api/mailboxes/${mailbox}/drafts/${draft}/review`, { revision: 1, decision: 'approved' })).status, 200);
  const review = portal.db.prepare('SELECT snapshot_id FROM mail_reviews WHERE draft_id=? AND decision=?').get(draft, 'approved');
  assert.equal(review.snapshot_id, snapshot.id, 'the approval references the rendered snapshot');
  assert.equal((await reviewer.post(`/api/mailboxes/${mailbox}/drafts/${draft}/send`, { revision: 1, idempotencyKey: randomUUID() })).status, 200);
  await portal.runCron();
  const sent = captured(mailbox);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, 'Meeting with Acme <b>Trust</b>');
});

test('a new revision stays unused until published, and earlier drafts keep their pinned version', async () => {
  const mailbox = await createMailbox();
  const { id, versionId: v1 } = await createTemplate(mailbox);
  await publish(id);
  const draft = await draftFrom(mailbox, v1);
  const saved = await manager.post(`/api/email-templates/${id}/versions`, { version: 1, definition: definition(mailbox, { subject: 'Revised: {{org_name}}' }) });
  assert.equal(saved.status, 201, saved.text);
  assert.equal((await manager.post(`/api/email-templates/${id}/versions`, { version: 1, definition: definition(mailbox) })).status, 409, 'stale revision');
  assert.deepEqual((await drafter.get(`/api/mailboxes/${mailbox}/templates`)).json.templates.map((t) => t.version), [1]);
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/templates/drafts`, { versionId: saved.json.versionId, values, to: ['client@example.org'] })).status, 409);
  await publish(id, 2);
  const second = await draftFrom(mailbox, saved.json.versionId);
  const pins = portal.db.prepare('SELECT draft_id, template_version_id FROM mail_draft_snapshots WHERE draft_id IN (?, ?)').all(draft, second);
  assert.equal(pins.find((p) => p.draft_id === draft).template_version_id, v1);
  assert.equal(pins.find((p) => p.draft_id === second).template_version_id, saved.json.versionId);
  const detail = await manager.get(`/api/email-templates/${id}`);
  assert.deepEqual(detail.json.versions.map((v) => v.version), [2, 1]);
});

test('templates are invisible without access and each action needs its own permission', async () => {
  const mailbox = await createMailbox();
  const { id, versionId } = await createTemplate(mailbox);
  await publish(id);
  assert.equal((await anonymous(portal).get('/api/email-templates')).status, 401);
  assert.equal((await outsider.get('/api/email-templates')).json.templates.some((t) => t.template.id === id), false);
  for (const path of [`/api/email-templates/${id}`, `/api/mailboxes/${mailbox}/templates`, `/api/mailboxes/${mailbox}/templates/reminders`]) {
    assert.equal((await outsider.get(path)).status, 404, path);
  }
  assert.equal((await outsider.post(`/api/mailboxes/${mailbox}/templates/preview`, { versionId, values, to: [] })).status, 404);
  assert.equal((await outsider.post(`/api/email-templates/${id}/status`, { version: 1, action: 'retire' })).status, 404);
  assert.equal((await admin.get(`/api/email-templates/${id}`)).status, 404, 'platform administration does not imply mailbox template access');

  assert.equal((await viewer.get(`/api/mailboxes/${mailbox}/templates`)).status, 403);
  assert.equal((await viewer.post(`/api/mailboxes/${mailbox}/templates/preview`, { versionId, values, to: [] })).status, 404, 'a read-only member has no template action');
  assert.equal((await drafter.post(`/api/email-templates/${id}/status`, { version: 1, action: 'retire' })).status, 403);
  assert.equal((await drafter.post(`/api/email-templates/${id}/versions`, { version: 1, definition: definition(mailbox) })).status, 403);
  assert.equal((await drafter.post('/api/email-templates', { name: 'Mine', ownerScope: 'mailbox', ownerId: mailbox, definition: definition(mailbox) })).status, 403);
  assert.equal((await drafter.post('/api/email-templates', { name: 'Club', ownerScope: 'global', ownerId: null, definition: definition(mailbox) })).status, 403);
  assert.equal((await drafter.post('/api/email-templates', { name: 'Dept', ownerScope: 'department', ownerId: 'finance', definition: definition(mailbox) })).status, 403);
  assert.equal((await manager.post('/api/email-templates', { name: 'Global', ownerScope: 'global', ownerId: null, definition: definition(mailbox) })).status, 403);
});

test('authors cannot route a template through a mailbox they do not manage or inject code', async () => {
  const mailbox = await createMailbox(), other = await createMailbox();
  assert.equal((await manager.post('/api/email-templates', { name: 'X', ownerScope: 'mailbox', ownerId: mailbox, definition: definition(mailbox, { allowedMailboxIds: [mailbox, randomUUID()] }) })).status, 404);
  assert.equal((await admin.put(`/api/mailboxes/${other}/members/${ids.manager}`, { capabilities: reader })).status, 200);
  assert.equal((await manager.post('/api/email-templates', { name: 'X', ownerScope: 'mailbox', ownerId: mailbox, definition: definition(mailbox, { allowedMailboxIds: [mailbox, other] }) })).status, 403);
  const unknown = await manager.post('/api/email-templates', { name: 'X', ownerScope: 'mailbox', ownerId: mailbox, definition: definition(mailbox, { body: '{{constructor.constructor}}' }) });
  assert.equal(unknown.status, 400, unknown.text);
  assert.equal((await manager.post('/api/email-templates', { name: 'X', ownerScope: 'mailbox', ownerId: mailbox, definition: { ...definition(mailbox), html: '<script>' } })).status, 400);
});

test('retiring blocks new drafts and further steps on pinned drafts without touching sent history', async () => {
  const mailbox = await createMailbox();
  const { id, versionId } = await createTemplate(mailbox);
  await publish(id);
  const draft = await draftFrom(mailbox, versionId);
  assert.equal((await manager.post(`/api/email-templates/${id}/status`, { version: 1, action: 'retire' })).status, 200);
  assert.equal((await drafter.get(`/api/mailboxes/${mailbox}/templates`)).json.templates.length, 0);
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/templates/drafts`, { versionId, values, to: ['client@example.org'] })).status, 409);
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/drafts/${draft}/submit`, { revision: 1 })).status, 409);
  assert.equal((await manager.post(`/api/email-templates/${id}/status`, { version: 1, action: 'publish' })).status, 409);
  assert.equal((await drafter.get(`/api/mailboxes/${mailbox}/drafts/${draft}`)).status, 200, 'the pinned draft stays readable');
});

test('allowed recipients are enforced when drafting and when a pinned draft is edited', async () => {
  const mailbox = await createMailbox();
  const { id, versionId } = await createTemplate(mailbox, { allowedRecipients: ['client@example.org'] });
  await publish(id);
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/templates/drafts`, { versionId, values, to: ['someone@example.org'] })).status, 400);
  const draft = await draftFrom(mailbox, versionId);
  const edit = { to: ['someone@example.org'], cc: [], bcc: [], subject: 'Changed', text: 'Changed', attachmentIds: [], revision: 1 };
  assert.equal((await drafter.patch(`/api/mailboxes/${mailbox}/drafts/${draft}`, edit)).status, 400);
  assert.equal((await drafter.patch(`/api/mailboxes/${mailbox}/drafts/${draft}`, { ...edit, to: ['CLIENT@example.org'] })).status, 200);
  const pinned = portal.db.prepare('SELECT template_version_id FROM mail_draft_snapshots WHERE draft_id=? AND revision=2').get(draft);
  assert.equal(pinned.template_version_id, versionId, 'a revision keeps the template pin');
});

test('a per-template policy narrows who may publish and who may approve', async () => {
  const mailbox = await createMailbox();
  const restricted = await createTemplate(mailbox, { policy: { publish: [ids.outsider] } });
  assert.equal((await manager.post(`/api/email-templates/${restricted.id}/status`, { version: 1, action: 'publish' })).status, 403);
  const { id, versionId } = await createTemplate(mailbox, { policy: { send: [ids.manager] } });
  await publish(id);
  const draft = await draftFrom(mailbox, versionId);
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/drafts/${draft}/submit`, { revision: 1 })).status, 200);
  assert.equal((await reviewer.post(`/api/mailboxes/${mailbox}/drafts/${draft}/review`, { revision: 1, decision: 'approved' })).status, 403);
});

test('test sends reach only the caller and respect the outbound pause', async () => {
  const mailbox = await createMailbox();
  const { versionId } = await createTemplate(mailbox, { allowedRecipients: ['client@example.org'] });
  const sent = await drafter.post(`/api/mailboxes/${mailbox}/templates/test`, { versionId, values, to: ['victim@example.org'] });
  assert.equal(sent.status, 400, 'a test cannot name recipients');
  const ok = await drafter.post(`/api/mailboxes/${mailbox}/templates/test`, { versionId, values });
  assert.equal(ok.status, 200, ok.text);
  const campaign = portal.db.prepare('SELECT recipients FROM email_queue WHERE id=?');
  assert.deepEqual(JSON.parse(campaign.get(ok.json.campaignId).recipients), ['tmpl.drafter@example.org']);
  // The drain handles one campaign per run, oldest first (fixture invitations are queued ahead).
  const status = portal.db.prepare('SELECT status FROM email_queue WHERE id=?');
  for (let run = 0; run < 20 && status.get(ok.json.campaignId).status !== 'done'; run++) await portal.runCron();
  assert.equal(status.get(ok.json.campaignId).status, 'done');
  const messages = portal.db.prepare("SELECT recipient, subject FROM dev_outbox WHERE subject LIKE '[Test]%'").all().map((row) => ({ ...row }));
  assert.deepEqual(messages, [{ recipient: 'tmpl.drafter@example.org', subject: '[Test] Meeting with Acme <b>Trust</b>' }]);
  const logged = portal.db.prepare("SELECT details FROM audit_log WHERE action='template.test'").get();
  assert.equal(logged.details.includes('Acme'), false, 'audit holds no message content');
  assert.equal((await manager.patch(`/api/mailboxes/${mailbox}`, { outboundPaused: true })).status, 200);
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/templates/test`, { versionId, values })).status, 409);
});

test('follow-up reminders are suggestions only after the configured interval', async () => {
  const mailbox = await createMailbox();
  const { id, versionId } = await createTemplate(mailbox, { followupDays: 3 });
  await publish(id);
  const draft = await draftFrom(mailbox, versionId);
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox}/drafts/${draft}/submit`, { revision: 1 })).status, 200);
  assert.equal((await reviewer.post(`/api/mailboxes/${mailbox}/drafts/${draft}/review`, { revision: 1, decision: 'approved' })).status, 200);
  assert.equal((await reviewer.post(`/api/mailboxes/${mailbox}/drafts/${draft}/send`, { revision: 1, idempotencyKey: randomUUID() })).status, 200);
  await portal.runCron();
  assert.equal((await drafter.get(`/api/mailboxes/${mailbox}/templates/reminders`)).json.reminders.length, 0, 'not due yet');
  portal.db.prepare("UPDATE mail_drafts SET updated_at='2000-01-01T00:00:00Z' WHERE id=?").run(draft);
  const due = await drafter.get(`/api/mailboxes/${mailbox}/templates/reminders`);
  assert.deepEqual(due.json.reminders.map((r) => [r.draftId, r.templateId, r.to]), [[draft, id, ['client@example.org']]]);
  await portal.runCron();
  assert.equal(captured(mailbox).length, 1, 'no follow-up is sent automatically');
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM mail_drafts WHERE mailbox_id=?').get(mailbox).n, 1, 'no follow-up draft is created automatically');
});

test('starter templates are offered to mailbox managers only and are valid definitions', async () => {
  const mailbox = await createMailbox();
  assert.equal((await drafter.get(`/api/mailboxes/${mailbox}/templates/starters`)).status, 403);
  const starters = (await manager.get(`/api/mailboxes/${mailbox}/templates/starters`)).json.starters;
  assert.equal(starters.length, 11);
  for (const starter of starters) {
    const created = await manager.post('/api/email-templates', { name: starter.name, ownerScope: 'mailbox', ownerId: mailbox, definition: starter.definition });
    assert.equal(created.status, 201, `${starter.id}: ${created.text}`);
  }
});
