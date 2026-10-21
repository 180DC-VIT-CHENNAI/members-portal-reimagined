import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInboundTestHarness } from 'void/email/testing';
import { contentIdentity, messageIds, normalizedAddress, safeFilename, subjectKey } from './inbound-rules.ts';
import { inboundHandler } from './inbound-handler.ts';
import type { RawDelivery } from './ingest.ts';
import { MAX_INBOUND_BYTES } from './inbox-types.ts';
import { parseInbound } from './mime.ts';
import { sanitizeEmailHtml } from './sanitize-email.ts';

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const envelope = { from: 'client@example.org', to: 'technical@180dc.example' };
const plain = [
  'From: "Client \u202eevil" <Client@Example.org>', 'To: Technical <technical@180dc.example>',
  'Subject: =?UTF-8?B?UmU6IFByb3Bvc2FsIOKckw==?=', 'Message-ID: <reply-1@example.org>',
  'In-Reply-To: <out-1@180dc.example>', 'References: <root@example.org> <out-1@180dc.example>',
  'Authentication-Results: mx.example; dkim=pass', 'Content-Type: text/plain; charset=utf-8', '', 'Thanks, see you Tuesday.',
].join('\r\n');

function multipart(parts: readonly string[]) {
  return ['From: client@example.org', 'To: technical@180dc.example', 'Subject: Files', 'Message-ID: <files@example.org>',
    'Content-Type: multipart/mixed; boundary="b"', '', ...parts.flatMap((p) => ['--b', p]), '--b--', ''].join('\r\n');
}
const attachment = (name: string, type: string) =>
  `Content-Type: ${type}; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\naGVsbG8=`;

test('envelope addresses normalize to lowercase full addresses and reject malformed input', () => {
  assert.equal(normalizedAddress(' Technical@180DC.Example '), 'technical@180dc.example');
  for (const bad of ['no-at', 'a@b', 'a b@example.org', 'x@exa/mple.org', `${'a'.repeat(65)}@example.org`]) assert.equal(normalizedAddress(bad), null, bad);
});

test('RFC message ids, reply subjects and filenames are parsed defensively', () => {
  assert.deepEqual(messageIds('<a@x> junk <no-at> <b@y>'), ['a@x', 'b@y']);
  assert.equal(subjectKey('RE: Fwd[2]: AW:  Proposal   draft'), 'proposal draft');
  assert.equal(safeFilename('../../etc/passwd'), 'passwd');
  assert.equal(safeFilename('..hidden'), '_hidden');
  assert.equal(safeFilename('a"b<c>.pdf'), 'a_b_c_.pdf');
});

test('content identity survives trace-header rewrites but not body or envelope changes', async () => {
  const base = await contentIdentity({ ...envelope, raw: enc(plain) });
  assert.equal(await contentIdentity({ ...envelope, raw: enc(`Received: from relay-2\r\nARC-Seal: i=2\r\n${plain}`) }), base);
  assert.notEqual(await contentIdentity({ ...envelope, raw: enc(`${plain} Changed`) }), base);
  assert.notEqual(await contentIdentity({ ...envelope, to: 'events@180dc.example', raw: enc(plain) }), base);
});

test('a plain reply parses identities, threading headers and auth signals without trusting display names', async () => {
  const parsed = await parseInbound({ ...envelope, raw: enc(plain) });
  assert.equal(parsed.quarantineReason, null);
  assert.equal(parsed.from.address, 'client@example.org');
  assert.equal(parsed.from.name.includes('\u202e'), false);
  assert.equal(parsed.subject, 'Re: Proposal \u2713');
  assert.equal(parsed.rfcMessageId, 'reply-1@example.org');
  assert.equal(parsed.inReplyTo, 'out-1@180dc.example');
  assert.deepEqual(parsed.references, ['root@example.org', 'out-1@180dc.example']);
  assert.match(parsed.authSignals, /dkim=pass/);
  assert.match(parsed.text, /Tuesday/);
});

test('passive attachments are allowed and executable or mismatched ones quarantine the message', async () => {
  const ok = await parseInbound({ ...envelope, raw: enc(multipart(['Content-Type: text/plain\r\n\r\nSee attached', attachment('brief.pdf', 'application/pdf')])) });
  assert.equal(ok.quarantineReason, null);
  assert.deepEqual(ok.attachments.map((a) => [a.filename, a.allowed, new TextDecoder().decode(a.bytes)]), [['brief.pdf', true, 'hello']]);
  for (const [name, type] of [['run.exe', 'application/octet-stream'], ['invoice.pdf', 'application/x-msdownload'], ['page.html', 'text/html']]) {
    const bad = await parseInbound({ ...envelope, raw: enc(multipart(['Content-Type: text/plain\r\n\r\nx', attachment(name, type)])) });
    assert.equal(bad.quarantineReason, 'dangerous_attachment', name);
  }
});

test('unparseable or oversized MIME is kept for quarantine instead of being discarded', async () => {
  assert.equal((await parseInbound({ ...envelope, raw: enc('\r\n\r\n') })).quarantineReason, 'unparseable');
  const big = await parseInbound({ ...envelope, raw: new ArrayBuffer(10 * 1024 * 1024 + 1) });
  assert.equal(big.quarantineReason, 'oversized');
  assert.equal(big.from.address, 'client@example.org');
});

test('rendered email HTML drops scripts, handlers, styles and forms, and blocks remote images unless opted in', () => {
  const input = `<p onclick="x()" style="color:red">Hi <b>there</b></p><script>alert(1)</script><style>p{}</style>
    <a href="javascript:alert(1)">bad</a><a href="https://example.org/?a=1&amp;b=2" onmouseover="x">good</a>
    <img src="https://tracker.example/p.gif" alt="logo"><img src="data:image/png;base64,AA"><form><input></form><iframe src="https://x"></iframe>`;
  const blocked = sanitizeEmailHtml(input);
  assert.equal(blocked.remoteBlocked, true);
  assert.doesNotMatch(blocked.html ?? '', /script|onclick|onmouseover|style=|javascript:|<form|<input|<iframe|tracker|data:/i);
  assert.match(blocked.html ?? '', /<p>Hi <b>there<\/b><\/p>/);
  assert.match(blocked.html ?? '', /<a href="https:\/\/example.org\/\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">good<\/a>/);
  assert.match(blocked.html ?? '', /\[logo \]/);
  const remote = sanitizeEmailHtml(input, true);
  assert.match(remote.html ?? '', /<img src="https:\/\/tracker.example\/p.gif" alt="logo" referrerpolicy="no-referrer">/);
});

test('the email handler stores through ingest, rejects unknown mailboxes and never accepts oversized mail', async () => {
  const seen: RawDelivery[] = [];
  const handler = inboundHandler(async (delivery) => {
    seen.push(delivery);
    return delivery.to === 'technical@180dc.example'
      ? { state: 'received', messageId: 'm', conversationId: 'c' }
      : { state: 'rejected', reason: 'Mailbox unavailable' };
  });
  const harness = createInboundTestHarness({ routes: { _default: handler }, slug: null });
  await harness.deliver({ from: envelope.from, to: envelope.to, raw: plain });
  await harness.deliver({ from: envelope.from, to: 'unknown@180dc.example', raw: plain });
  assert.equal(seen.length, 2);
  assert.equal(new TextDecoder().decode(seen[0].raw), plain);
  assert.deepEqual(harness.rejects, ['Mailbox unavailable']);
  harness.clear();
  await harness.deliver({ from: envelope.from, to: envelope.to, raw: new Uint8Array(MAX_INBOUND_BYTES + 1) });
  assert.deepEqual(harness.rejects, ['Message exceeds 25 MiB']);
  assert.equal(seen.length, 2);
});

test('storage failures surface to the transport instead of silently accepting mail', async () => {
  const harness = createInboundTestHarness({ routes: { _default: inboundHandler(async () => { throw new Error('R2 down'); }) }, slug: null });
  await assert.rejects(harness.deliver({ from: envelope.from, to: envelope.to, raw: plain }), /R2 down/);
  assert.deepEqual(harness.rejects, []);
});
