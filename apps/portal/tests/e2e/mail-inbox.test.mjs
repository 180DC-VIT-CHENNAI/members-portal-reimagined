import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

let portal, admin, manager, viewer, drafter, reviewer, assigner, outsider;
const ids = {};
const reader = ['mailbox.read'];
const grants = {
  manager: ['mailbox.manage', ...reader],
  viewer: reader,
  drafter: [...reader, 'mailbox.draft.create', 'mailbox.draft.edit_own', 'mailbox.draft.submit'],
  reviewer: [...reader, 'mailbox.review', 'mailbox.approve', 'mailbox.send'],
  assigner: [...reader, 'mailbox.assign'],
};

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture', INBOUND_TEST_INGEST: '1' });
  admin = signIn(portal, 'srijan.guchhait@gmail.com');
  for (const name of ['manager', 'viewer', 'drafter', 'reviewer', 'assigner', 'outsider']) {
    const invited = await admin.post('/api/people', { email: `inbox.${name}@example.org`, fullName: `Inbox ${name}`, departmentId: 'finance' });
    assert.equal(invited.status, 201, invited.text);
    ids[name] = invited.json.id;
  }
  manager = signIn(portal, 'inbox.manager@example.org');
  viewer = signIn(portal, 'inbox.viewer@example.org');
  drafter = signIn(portal, 'inbox.drafter@example.org');
  reviewer = signIn(portal, 'inbox.reviewer@example.org');
  assigner = signIn(portal, 'inbox.assigner@example.org');
  outsider = signIn(portal, 'inbox.outsider@example.org');
});
after(async () => { await portal?.stop(); });
beforeEach(() => { portal.db.prepare('DELETE FROM rate_limits').run(); });

async function createMailbox({ inbound = true, members = grants } = {}) {
  const address = `technical-${randomUUID().slice(0, 8)}@180dc.example`;
  const created = await admin.post('/api/mailboxes', { address, displayName: 'Technical', managerId: ids.manager });
  assert.equal(created.status, 201, created.text);
  const id = created.json.id;
  for (const [who, capabilities] of Object.entries(members)) {
    const granted = await admin.put(`/api/mailboxes/${id}/members/${ids[who]}`, { capabilities });
    assert.equal(granted.status, 200, granted.text);
  }
  const configured = await manager.patch(`/api/mailboxes/${id}`, { outboundAdapter: 'capture', inboundEnabled: inbound });
  assert.equal(configured.status, 200, configured.text);
  return { id, address };
}

function mime({ from = 'client@partner.example', to, subject = 'Partnership proposal', messageId = `${randomUUID()}@partner.example`,
  inReplyTo, references, body = 'Hello from the partner team.', extraHeaders = [], contentType = 'text/plain; charset=utf-8' }) {
  return [
    `From: Partner Lead <${from}>`, `To: Technical <${to}>`, `Subject: ${subject}`, `Message-ID: <${messageId}>`,
    'Date: Tue, 20 Oct 2026 10:00:00 +0000',
    ...(inReplyTo ? [`In-Reply-To: <${inReplyTo}>`] : []), ...(references ? [`References: ${references.map((r) => `<${r}>`).join(' ')}`] : []),
    ...extraHeaders, `Content-Type: ${contentType}`, '', body, '',
  ].join('\r\n');
}

async function deliver(raw, { from = 'client@partner.example', to }) {
  const res = await fetch(`${portal.base}/api/dev/ingest-mail?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
    method: 'POST', headers: { 'content-type': 'message/rfc822', accept: 'application/json' }, body: raw,
  });
  const text = await res.text();
  assert.equal(res.status, 200, text);
  return JSON.parse(text);
}

const conversations = (client, mailbox, query = '') => client.get(`/api/mailboxes/${mailbox}/conversations${query}`);

test('mail to a disabled, unknown or retired mailbox is refused; an enabled one stores raw MIME privately', async () => {
  const off = await createMailbox({ inbound: false });
  assert.deepEqual(await deliver(mime({ to: off.address }), { to: off.address }), { state: 'rejected', reason: 'Mailbox unavailable' });
  assert.equal((await deliver(mime({ to: 'nobody@180dc.example' }), { to: 'nobody@180dc.example' })).state, 'rejected');
  const on = await createMailbox();
  const raw = mime({ to: on.address });
  const result = await deliver(raw, { to: on.address.toUpperCase() });
  assert.equal(result.state, 'received');
  const row = portal.db.prepare('SELECT raw_object_key, raw_size, envelope_to, direction FROM mail_messages WHERE id=?').get(result.messageId);
  assert.equal(row.raw_object_key.startsWith(`mail-raw/${on.id}/`), true);
  assert.equal(row.raw_size, Buffer.byteLength(raw));
  assert.equal(row.envelope_to, on.address);
  assert.equal((await manager.patch(`/api/mailboxes/${on.id}`, { status: 'retired' })).status, 200);
  assert.equal((await deliver(mime({ to: on.address }), { to: on.address })).state, 'rejected');
});

test('authorized readers see the thread; outsiders, administrators and other mailboxes cannot discover it', async () => {
  const mailbox = await createMailbox(), other = await createMailbox();
  const { conversationId, messageId } = await deliver(mime({ to: mailbox.address, subject: 'Confidential scope' }), { to: mailbox.address });
  const list = await viewer.get(`/api/mailboxes/${mailbox.id}/conversations`);
  assert.equal(list.status, 200, list.text);
  assert.deepEqual(list.json.conversations.map((c) => [c.id, c.subject, c.unread]), [[conversationId, 'Confidential scope', true]]);
  const detail = await viewer.get(`/api/mailboxes/${mailbox.id}/conversations/${conversationId}`);
  assert.equal(detail.json.messages[0].text.trim(), 'Hello from the partner team.');
  assert.equal(detail.json.messages[0].from.address, 'client@partner.example');
  const paths = ['/conversations', `/conversations/${conversationId}`, `/conversations/${conversationId}/messages/${messageId}/body`,
    `/conversations/${conversationId}/attachments/guess`, '/counts', '/quarantine', '/assignees'];
  for (const who of [outsider, admin]) {
    for (const p of paths) assert.equal((await who.get(`/api/mailboxes/${mailbox.id}${p}`)).status, 404, p);
    assert.equal((await who.post(`/api/mailboxes/${mailbox.id}/conversations/${conversationId}/read`)).status, 404);
    assert.equal((await who.get('/api/mailboxes/unread')).json.unread, 0);
  }
  assert.equal((await anonymous(portal).get(`/api/mailboxes/${mailbox.id}/conversations`)).status, 401);
  // Members of another mailbox cannot reach this conversation through their own mailbox id either.
  assert.equal((await viewer.get(`/api/mailboxes/${other.id}/conversations/${conversationId}`)).status, 404);
  assert.equal((await viewer.get(`/api/mailboxes/${other.id}/conversations/${conversationId}/messages/${messageId}/body`)).status, 404);
});

test('duplicate and relayed re-deliveries create one message; read state is per member', async () => {
  const mailbox = await createMailbox();
  const raw = mime({ to: mailbox.address });
  const first = await deliver(raw, { to: mailbox.address });
  assert.deepEqual(await deliver(raw, { to: mailbox.address }), { state: 'duplicate' });
  assert.deepEqual(await deliver(`Received: from relay.example by mx.example\r\nARC-Seal: i=1\r\n${raw}`, { to: mailbox.address }), { state: 'duplicate' });
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM mail_messages WHERE mailbox_id=?').get(mailbox.id).n, 1);
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/counts`)).json.unread, 1);
  assert.equal((await viewer.get('/api/mailboxes/unread')).json.unread >= 1, true);
  assert.equal((await viewer.post(`/api/mailboxes/${mailbox.id}/conversations/${first.conversationId}/read`)).status, 200);
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/counts`)).json.unread, 0);
  assert.equal((await drafter.get(`/api/mailboxes/${mailbox.id}/counts`)).json.unread, 1);
  await deliver(mime({ to: mailbox.address, inReplyTo: portal.db.prepare('SELECT rfc_message_id AS id FROM mail_messages WHERE id=?').get(first.messageId).id, body: 'Follow-up' }), { to: mailbox.address });
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/counts`)).json.unread, 1, 'a new inbound message makes the thread unread again');
});

test('threading follows RFC headers and subject fallback, but never across senders or mailboxes', async () => {
  const mailbox = await createMailbox(), other = await createMailbox();
  const rootId = `${randomUUID()}@partner.example`;
  const root = await deliver(mime({ to: mailbox.address, messageId: rootId, subject: 'Budget review' }), { to: mailbox.address });
  const reply = await deliver(mime({ to: mailbox.address, subject: 'Something else entirely', inReplyTo: rootId, references: [rootId] }), { to: mailbox.address });
  assert.equal(reply.conversationId, root.conversationId);
  const fallback = await deliver(mime({ to: mailbox.address, subject: 'RE: Fwd: budget   REVIEW' }), { to: mailbox.address });
  assert.equal(fallback.conversationId, root.conversationId);
  // A different sender quoting the same Message-ID or subject gets its own thread.
  const stranger = await deliver(mime({ from: 'stranger@elsewhere.example', to: mailbox.address, subject: 'Re: Budget review', inReplyTo: rootId }),
    { from: 'stranger@elsewhere.example', to: mailbox.address });
  assert.notEqual(stranger.conversationId, root.conversationId);
  const crossMailbox = await deliver(mime({ to: other.address, subject: 'Re: Budget review', inReplyTo: rootId }), { to: other.address });
  assert.notEqual(crossMailbox.conversationId, root.conversationId);
  const detail = await viewer.get(`/api/mailboxes/${mailbox.id}/conversations/${root.conversationId}`);
  assert.equal(detail.json.messages.length, 3);
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/conversations/${stranger.conversationId}`)).json.messages.length, 1);
});

test('only assigners triage; assignees must hold mailbox read; views and notes follow the same scope', async () => {
  const mailbox = await createMailbox();
  const { conversationId } = await deliver(mime({ to: mailbox.address }), { to: mailbox.address });
  const path = `/api/mailboxes/${mailbox.id}/conversations/${conversationId}`;
  assert.equal((await viewer.patch(path, { status: 'pending' })).status, 403);
  assert.equal((await manager.patch(path, { status: 'pending' })).status, 403, 'management does not imply assignment');
  assert.equal((await assigner.patch(path, { assignedTo: ids.outsider })).status, 400);
  assert.equal((await assigner.get(`/api/mailboxes/${mailbox.id}/assignees`)).json.people.some((p) => p.id === ids.outsider), false);
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/assignees`)).status, 403);
  const due = new Date(Date.now() - 60_000).toISOString();
  const triaged = await assigner.patch(path, { assignedTo: ids.viewer, priority: 'high', tags: ['partnership', 'partnership'], dueForReplyAt: due, status: 'pending' });
  assert.equal(triaged.status, 200, triaged.text);
  const mine = await viewer.get(`/api/mailboxes/${mailbox.id}/conversations?view=assigned`);
  assert.deepEqual(mine.json.conversations.map((c) => [c.id, c.priority, c.status, c.assigneeName]), [[conversationId, 'high', 'pending', 'Inbox viewer']]);
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/counts`)).json.overdue, 1);
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/conversations?view=unassigned`)).json.conversations.length, 0);
  assert.equal((await viewer.post(`${path}/notes`, { body: 'I will call them' })).status, 403);
  assert.equal((await assigner.post(`${path}/notes`, { body: 'Viewer owns this' })).status, 201);
  assert.equal((await drafter.post(`${path}/notes`, { body: 'Draft coming' })).status, 201);
  assert.deepEqual((await viewer.get(path)).json.notes.map((n) => n.body).sort(), ['Draft coming', 'Viewer owns this']);
  assert.equal((await assigner.patch(path, { status: 'closed' })).status, 200);
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/conversations`)).json.conversations.length, 0);
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/conversations?view=archive`)).json.conversations[0].id, conversationId);
  // Revoking read access removes the person from assignment eligibility and from the thread.
  assert.equal((await admin.put(`/api/mailboxes/${mailbox.id}/members/${ids.viewer}`, { capabilities: [] })).status, 200);
  assert.equal((await viewer.get(path)).status, 404);
  assert.equal((await assigner.patch(path, { assignedTo: ids.viewer })).status, 400);
});

test('search is scoped to the mailbox and never matches quarantined content', async () => {
  const mailbox = await createMailbox(), other = await createMailbox();
  await deliver(mime({ to: mailbox.address, subject: 'Quarterly', body: 'The zebra budget is attached.' }), { to: mailbox.address });
  await deliver(mime({ to: other.address, subject: 'Quarterly', body: 'Another zebra mention.' }), { to: other.address });
  const held = multipartMime({ to: mailbox.address, body: 'zebra hidden', attachment: { name: 'tool.exe', type: 'application/octet-stream' } });
  assert.equal((await deliver(held, { to: mailbox.address })).state, 'quarantined');
  const found = await viewer.get(`/api/mailboxes/${mailbox.id}/conversations?view=search&q=zebra`);
  assert.equal(found.json.conversations.length, 1);
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/conversations?view=search&q=${encodeURIComponent('%')}`)).json.conversations.length, 0);
});

function multipartMime({ to, body, attachment, html }) {
  return [
    'From: Partner Lead <client@partner.example>', `To: ${to}`, 'Subject: Files for review', `Message-ID: <${randomUUID()}@partner.example>`,
    'Content-Type: multipart/mixed; boundary="mix"', '', '--mix',
    html ? `Content-Type: text/html; charset=utf-8\r\n\r\n${html}` : `Content-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
    '--mix', `Content-Type: ${attachment.type}; name="${attachment.name}"`, `Content-Disposition: attachment; filename="${attachment.name}"`,
    'Content-Transfer-Encoding: base64', '', Buffer.from(attachment.data ?? 'attachment-bytes').toString('base64'), '--mix--', '',
  ].join('\r\n');
}

test('safe HTML is sanitized, remote content is opt-in and allowed attachments download privately', async () => {
  const mailbox = await createMailbox();
  const html = '<p onclick="steal()">Hi <script>alert(1)</script><img src="https://tracker.example/p.gif" alt="pixel"><a href="javascript:x">x</a></p>';
  const { conversationId, messageId } = await deliver(multipartMime({ to: mailbox.address, html, attachment: { name: 'brief.pdf', type: 'application/pdf', data: '%PDF-1.4 test' } }), { to: mailbox.address });
  const base = `/api/mailboxes/${mailbox.id}/conversations/${conversationId}`;
  const body = await viewer.get(`${base}/messages/${messageId}/body`);
  assert.equal(body.status, 200, body.text);
  assert.doesNotMatch(body.json.document, /script>|onclick|tracker\.example|javascript:/);
  assert.match(body.json.document, /default-src 'none'/);
  assert.equal(body.json.remoteBlocked, true);
  assert.match((await viewer.get(`${base}/messages/${messageId}/body?remote=1`)).json.document, /tracker\.example\/p\.gif/);
  const stored = portal.db.prepare('SELECT html_object_key FROM mail_messages WHERE id=?').get(messageId);
  assert.equal(stored.html_object_key.startsWith(`mail-inbound/${mailbox.id}/`), true);
  const [attachment] = (await viewer.get(base)).json.messages[0].attachments;
  assert.equal(attachment.filename, 'brief.pdf');
  const download = await viewer.get(`${base}/attachments/${attachment.id}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /^attachment;/);
  assert.equal(download.headers.get('content-type'), 'application/octet-stream');
  assert.equal(download.text, '%PDF-1.4 test');
  assert.equal((await outsider.get(`${base}/attachments/${attachment.id}`)).status, 404);
});

test('dangerous or unparseable mail is quarantined for managers only, then released or deleted', async () => {
  const mailbox = await createMailbox();
  const held = await deliver(multipartMime({ to: mailbox.address, body: 'Run this', attachment: { name: 'setup.exe', type: 'application/x-msdownload' } }), { to: mailbox.address });
  assert.equal(held.state, 'quarantined');
  assert.equal(held.conversationId, null);
  const broken = await deliver('\r\n\r\n', { to: mailbox.address });
  assert.equal(broken.state, 'quarantined');
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/conversations`)).json.conversations.length, 0);
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/quarantine`)).status, 403);
  assert.equal((await viewer.post(`/api/mailboxes/${mailbox.id}/quarantine/${held.messageId}/release`)).status, 403);
  const queue = await manager.get(`/api/mailboxes/${mailbox.id}/quarantine`);
  assert.deepEqual(queue.json.messages.map((m) => m.reason).sort(), ['dangerous_attachment', 'unparseable']);
  const headers = await manager.get(`/api/mailboxes/${mailbox.id}/quarantine/${held.messageId}`);
  assert.match(headers.json.headers, /Subject: Files for review/);
  assert.doesNotMatch(headers.json.headers, /Run this/);
  const released = await manager.post(`/api/mailboxes/${mailbox.id}/quarantine/${held.messageId}/release`);
  assert.equal(released.status, 200, released.text);
  assert.equal((await manager.post(`/api/mailboxes/${mailbox.id}/quarantine/${held.messageId}/release`)).status, 404);
  const detail = await viewer.get(`/api/mailboxes/${mailbox.id}/conversations/${released.json.conversationId}`);
  const [attachment] = detail.json.messages[0].attachments;
  assert.equal(attachment.quarantineStatus, 'quarantined');
  assert.equal((await viewer.get(`/api/mailboxes/${mailbox.id}/conversations/${released.json.conversationId}/attachments/${attachment.id}`)).status, 403);
  assert.equal((await manager.del(`/api/mailboxes/${mailbox.id}/quarantine/${broken.messageId}`)).status, 200);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM mail_messages WHERE id=?').get(broken.messageId).n, 0);
  assert.deepEqual(await deliver('\r\n\r\n', { to: mailbox.address }), { state: 'duplicate' }, 'a deleted delivery is still deduplicated');
  const audit = portal.db.prepare("SELECT action FROM mail_audit WHERE mailbox_id=? AND action LIKE 'mail.%'").all(mailbox.id).map((r) => r.action);
  for (const action of ['mail.inbound.quarantined', 'mail.quarantine.release', 'mail.quarantine.delete']) assert.equal(audit.includes(action), true, action);
});

test('replies are drafted into the thread, restricted to participants, and the approved send joins the conversation', async () => {
  const mailbox = await createMailbox();
  const { conversationId, messageId } = await deliver(mime({ to: mailbox.address, subject: 'Workshop dates' }), { to: mailbox.address });
  const base = `/api/mailboxes/${mailbox.id}/conversations/${conversationId}`;
  assert.equal((await viewer.post(`${base}/reply`, { messageId })).status, 403);
  assert.equal((await outsider.post(`${base}/reply`, { messageId })).status, 404);
  const draft = await drafter.post(`${base}/reply`, { messageId });
  assert.equal(draft.status, 201, draft.text);
  const loaded = await drafter.get(`/api/mailboxes/${mailbox.id}/drafts/${draft.json.id}`);
  assert.deepEqual(loaded.json.snapshot.recipients.to, ['client@partner.example']);
  assert.equal(loaded.json.snapshot.subject, 'Re: Workshop dates');
  assert.equal(loaded.json.draft.conversationId, conversationId);
  // repliesOnly (the default) refuses recipients outside the thread.
  const widened = await drafter.patch(`/api/mailboxes/${mailbox.id}/drafts/${draft.json.id}`, {
    to: ['client@partner.example'], cc: ['someone.new@elsewhere.example'], bcc: [], subject: 'Re: Workshop dates', text: 'Hi', attachmentIds: [], category: 'correspondence', revision: 1,
  });
  assert.equal(widened.status, 400, widened.text);
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox.id}/drafts/${draft.json.id}/submit`, { revision: 1 })).status, 200);
  assert.equal((await reviewer.post(`/api/mailboxes/${mailbox.id}/drafts/${draft.json.id}/review`, { revision: 1, decision: 'approved' })).status, 200);
  const sent = await reviewer.post(`/api/mailboxes/${mailbox.id}/drafts/${draft.json.id}/send`, { revision: 1, idempotencyKey: randomUUID() });
  assert.equal(sent.status, 200, sent.text);
  await portal.runCron();
  const thread = await viewer.get(base);
  assert.deepEqual(thread.json.messages.map((m) => [m.direction, m.status]), [['in', 'received'], ['out', 'accepted']]);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM dev_outbox WHERE from_address=?').get(mailbox.address).n, 1);
  await portal.runCron();
  assert.equal((await viewer.get(base)).json.messages.length, 2, 'a repeated cron never records the send twice');
  const followUp = await deliver(mime({ to: mailbox.address, subject: 'Re: Workshop dates', body: 'Thursday works.' }), { to: mailbox.address });
  assert.equal(followUp.conversationId, conversationId);
});

test('a reply draft cannot point at another mailbox conversation', async () => {
  const mailbox = await createMailbox(), other = await createMailbox();
  const foreign = await deliver(mime({ to: other.address }), { to: other.address });
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox.id}/conversations/${foreign.conversationId}/reply`, { messageId: foreign.messageId })).status, 404);
});

test('incoming mail, assignment and review create private scoped notices in the shared inbox', async () => {
  const mailbox = await createMailbox();
  const raw = mime({ to: mailbox.address, subject: 'Secret board decision', body: 'Private contract numbers' });
  const received = await deliver(raw, { to: mailbox.address });
  const path = `/api/mailboxes/${mailbox.id}/conversations/${received.conversationId}`;
  const mine = async (client) => {
    const response = await client.get('/api/notifications/mail');
    assert.equal(response.status, 200, response.text);
    assert.match(response.headers.get('cache-control'), /no-store/);
    return response.json.notices.filter((notice) => notice.mailboxId === mailbox.id);
  };
  const notices = await mine(viewer);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, 'mail_reply');
  assert.equal(notices[0].conversationId, received.conversationId);
  assert.doesNotMatch(JSON.stringify(notices), /Secret board|Private contract|partner\.example/);
  assert.deepEqual(await mine(admin), []);
  assert.deepEqual(await mine(outsider), []);
  assert.equal((await anonymous(portal).get('/api/notifications/mail')).status, 401);
  assert.equal((await anonymous(portal).post('/api/notifications/mail/read', { ids: [notices[0].id] })).status, 401);
  await deliver(raw, { to: mailbox.address });
  assert.equal((await mine(viewer)).length, 1, 'redelivery must not duplicate notices');
  assert.equal((await outsider.post('/api/notifications/mail/read', { ids: [notices[0].id] })).status, 200);
  assert.equal((await mine(viewer))[0].readAt, null, 'another recipient cannot acknowledge my notice');
  assert.equal((await viewer.post('/api/notifications/mail/read', { ids: [notices[0].id] })).status, 200);
  assert.notEqual((await mine(viewer))[0].readAt, null);

  assert.equal((await assigner.patch(path, { assignedTo: ids.viewer })).status, 200);
  assert.equal((await assigner.patch(path, { priority: 'high' })).status, 200);
  assert.equal((await mine(viewer)).filter((n) => n.kind === 'mail_assigned').length, 1);
  const draft = await drafter.post(`${path}/reply`, { messageId: received.messageId });
  assert.equal(draft.status, 201, draft.text);
  assert.equal((await drafter.post(`/api/mailboxes/${mailbox.id}/drafts/${draft.json.id}/submit`, { revision: 1 })).status, 200);
  const reviewNotice = (await mine(reviewer)).find((n) => n.kind === 'mail_review');
  assert.equal(reviewNotice.draftId, draft.json.id);
  assert.equal((await mine(viewer)).some((n) => n.kind === 'mail_review'), false);
  assert.equal((await admin.put(`/api/mailboxes/${mailbox.id}/members/${ids.reviewer}`, { capabilities: reader })).status, 200);
  assert.equal((await mine(reviewer)).some((n) => n.kind === 'mail_review'), false, 'review revocation hides pending requests');

  assert.equal((await admin.put(`/api/mailboxes/${mailbox.id}/members/${ids.viewer}`, { capabilities: [] })).status, 200);
  assert.deepEqual(await mine(viewer), [], 'read revocation hides incoming and assignment notices');
  assert.equal((await admin.put(`/api/mailboxes/${mailbox.id}/members/${ids.manager}`, { capabilities: ['mailbox.manage'] })).status, 200);
  await deliver(mime({ to: mailbox.address, subject: 'Management is not reading' }), { to: mailbox.address });
  assert.deepEqual(await mine(manager), []);
});

test('mail notice pagination and combined unread counts recheck grants; quarantine has no notices before release', async () => {
  const mailbox = await createMailbox({ members: { manager: grants.manager, outsider: reader } });
  const raw = mime({ to: mailbox.address });
  const received = await deliver(raw, { to: mailbox.address });
  assert.equal((await outsider.get('/api/notifications/count')).json.unread, 1);
  const original = portal.db.prepare('SELECT id FROM mail_notifications WHERE recipient_id=?').get(ids.outsider).id;
  for (let i = 0; i < 31; i++) portal.db.prepare(`INSERT INTO mail_notifications
    (recipient_id,mailbox_id,conversation_id,kind,dedupe_key) VALUES (?,?,?,'mail_assigned',?)`)
    .run(ids.outsider, mailbox.id, received.conversationId, `fixture-assignment:${i}`);
  const first = await outsider.get('/api/notifications/mail');
  assert.equal(first.json.notices.length, 30);
  assert.equal(Number.isInteger(first.json.nextBefore), true);
  const second = await outsider.get(`/api/notifications/mail?before=${first.json.nextBefore}`);
  assert.equal(second.json.notices.length, 2);
  assert.equal(new Set([...first.json.notices, ...second.json.notices].map((n) => n.id)).size, 32);
  assert.equal((await outsider.get('/api/notifications/mail?before=bad')).status, 400);
  assert.equal((await outsider.post('/api/notifications/mail/read', { upTo: original })).status, 200);
  assert.equal((await outsider.get('/api/notifications/count')).json.unread, 31);
  const held = await deliver('\r\n\r\n', { to: mailbox.address });
  assert.equal(held.state, 'quarantined');
  assert.equal((await outsider.get('/api/notifications/count')).json.unread, 31);
  assert.equal((await manager.post(`/api/mailboxes/${mailbox.id}/quarantine/${held.messageId}/release`)).status, 200);
  assert.equal((await outsider.get('/api/notifications/count')).json.unread, 32);
  assert.equal((await admin.put(`/api/mailboxes/${mailbox.id}/members/${ids.outsider}`, { capabilities: [] })).status, 200);
  assert.equal((await outsider.get('/api/notifications/count')).json.unread, 0);
  assert.deepEqual((await outsider.get('/api/notifications/mail')).json.notices, []);
});
