// Sends through Void's real sendEmail (no EMAIL_TEST_MODE). Under the dev
// server Void's email inbox captures each message instead of Cloudflare, so the
// raw messages show what the SEND_EMAIL binding is given in production.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
// A 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==', 'base64');
let portal;
let admin;

before(async () => {
  portal = await startPortal();
  admin = signIn(portal, ADMIN);
});
after(async () => {
  await portal?.stop();
});

async function inbox(path) {
  const res = await fetch(`${portal.base}/__void/inbox${path}`, { headers: { 'x-void-dev-trigger': portal.devToken } });
  assert.equal(res.status, 200, path);
  return res.text();
}

/** The raw RFC 822 text of the captured message with this subject. */
async function rawMessage(subject) {
  const list = await inbox('/');
  const ids = new Set([...list.matchAll(/\/__void\/inbox\/([^/?"]+)/g)].map((m) => m[1]));
  for (const id of ids) {
    const raw = await inbox(`/${id}/raw`);
    if (raw.includes(`Subject: ${subject}\r\n`)) return raw;
  }
  assert.fail(`no captured message with subject "${subject}"`);
}

test('direct mail leaves through sendEmail from the portal sender, with a text part and Reply-To', async () => {
  const res = await admin.post('/api/send-email', { to: 'member@example.com', subject: 'Transport check', body: 'Hello <team>\nSecond line' });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual([res.json.sent, res.json.failed, res.json.queued], [1, 0, 0]);
  const raw = await rawMessage('Transport check');
  assert.match(raw, /^From: "?180DC Admin"? <noreply@180dc\.vitcc\.org>\r$/m);
  assert.match(raw, /^To: .*member@example\.com/m);
  assert.match(raw, /^Reply-To: .*srijan\.guchhait@gmail\.com/mi);
  assert.match(raw, /^Content-Type: text\/plain/m);
  assert.match(raw, /^Content-Type: text\/html/m);
});

test('queued campaigns attach CASE_STUDIES files through the real cron', async () => {
  const form = new FormData();
  form.append('image', new Blob([PNG], { type: 'image/png' }), 'logo.png');
  const upload = await admin.post('/api/case-studies/upload-image', form);
  assert.equal(upload.status, 200, upload.text);
  const id = crypto.randomUUID();
  portal.db.prepare(`INSERT INTO email_queue (id, kind, from_address, subject, html, recipients, total, attachments)
    VALUES (?, 'custom', '180DC Admin <noreply@180dc.vitcc.org>', 'Attachment check', '<p>See attached</p>', ?, 1, ?)`)
    .run(id, JSON.stringify(['member@example.com']), JSON.stringify([{ filename: 'logo.png', key: upload.json.key }]));
  await portal.runCron();
  const row = portal.db.prepare('SELECT status, sent FROM email_queue WHERE id = ?').get(id);
  assert.equal(row.status, 'done');
  assert.equal(row.sent, 1);
  const raw = await rawMessage('Attachment check');
  assert.match(raw, /^Content-Disposition: attachment; filename="?logo\.png"?/mi);
  assert.ok(raw.replace(/\r\n/g, '').includes(PNG.toString('base64')), 'attachment bytes are carried base64-encoded');
});
