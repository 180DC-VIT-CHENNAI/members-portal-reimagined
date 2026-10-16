import assert from 'node:assert/strict';
import { test } from 'node:test';
import { smtpSession, SmtpError } from './smtp-session.ts';

const message = {
  from: '180DC Admin <technical@180dcvitc.org>',
  to: ['member@example.com'],
  subject: 'Hello',
  html: '<p>Test</p>',
};

/** A wire-level server: every client write must match the next protocol step. */
function server(steps: readonly (readonly [string | RegExp, string])[], greeting = '220 ready\r\n') {
  let index = 0;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    start(c) { controller = c; c.enqueue(encoder.encode(greeting)); },
  });
  const writable = new WritableStream<Uint8Array>({
    write(bytes) {
      const step = steps[index++];
      assert.ok(step, 'Unexpected SMTP command');
      const value = new TextDecoder().decode(bytes);
      if (typeof step[0] === 'string') assert.equal(value, step[0]);
      else assert.match(value, step[0]);
      controller.enqueue(encoder.encode(step[1]));
    },
  });
  return { readable, writable, complete: () => assert.equal(index, steps.length) };
}

test('SMTP PLAIN negotiates, sends MIME and reports acceptance', async () => {
  const wire = server([
    ['EHLO 180dcvitc.org\r\n', '250-test\r\n250 AUTH PLAIN LOGIN\r\n'],
    ['AUTH PLAIN AHVzZXIAcGFzcw==\r\n', '235 authenticated\r\n'],
    ['MAIL FROM:<technical@180dcvitc.org>\r\n', '250 ok\r\n'],
    ['RCPT TO:<member@example.com>\r\n', '250 ok\r\n'],
    ['DATA\r\n', '354 ready\r\n'],
    [/Content-Type: multipart\/alternative;[\s\S]*\r\n\.\r\n$/, '250 queued\r\n'],
  ]);
  const result = await smtpSession(wire.readable, wire.writable, 'user', 'pass', message);
  assert.deepEqual(result.accepted, message.to);
  assert.deepEqual(result.rejected, []);
  wire.complete();
});

test('SMTP LOGIN records a temporary RCPT rejection and continues to the next recipient', async () => {
  const wire = server([
    ['EHLO 180dcvitc.org\r\n', '250 AUTH LOGIN\r\n'],
    ['AUTH LOGIN\r\n', '334 user\r\n'],
    ['dXNlcg==\r\n', '334 password\r\n'],
    ['cGFzcw==\r\n', '235 authenticated\r\n'],
    ['MAIL FROM:<technical@180dcvitc.org>\r\n', '250 ok\r\n'],
    ['RCPT TO:<bad@example.com>\r\n', '450 try later\r\n'],
    ['RCPT TO:<member@example.com>\r\n', '251 forwarded\r\n'],
    ['DATA\r\n', '354 ready\r\n'],
    [/\r\n\.\r\n$/, '250 queued\r\n'],
  ]);
  const result = await smtpSession(wire.readable, wire.writable, 'user', 'pass', {
    ...message, to: ['bad@example.com', ...message.to],
  });
  assert.deepEqual(result.accepted, message.to);
  assert.deepEqual(result.rejected, ['bad@example.com']);
  wire.complete();
});

test('SMTP rejects authentication without leaking credentials or server text', async () => {
  const wire = server([
    ['EHLO 180dcvitc.org\r\n', '250 AUTH LOGIN\r\n'],
    ['AUTH LOGIN\r\n', '334 user\r\n'],
    ['dXNlcg==\r\n', '334 password\r\n'],
    ['cGFzcw==\r\n', '535 cGFzcw== rejected\r\n'],
  ]);
  await assert.rejects(
    smtpSession(wire.readable, wire.writable, 'user', 'pass', message),
    (error: unknown) => error instanceof SmtpError && error.code === 535 &&
      !error.message.includes('cGFzcw==') && !error.message.includes('pass'),
  );
  wire.complete();
});

test('SMTP fails on closed connections instead of spinning on empty replies', async () => {
  const readable = new ReadableStream<Uint8Array>({ start(c) { c.close(); } });
  await assert.rejects(
    smtpSession(readable, new WritableStream<Uint8Array>(), 'user', 'pass', message),
    SmtpError,
  );
});
