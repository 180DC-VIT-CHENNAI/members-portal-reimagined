import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMimeMessage, htmlToPlainText, quotedPrintable } from './mime.ts';

const message = {
  from: '180DC Admin <technical@180dcvitc.org>',
  to: ['member@example.com'],
  subject: 'Update',
  html: '<p>Hello &amp; welcome</p>',
};

test('MIME protects recipient headers and extra header framing', () => {
  const mime = buildMimeMessage({
    ...message,
    to: ['member@example.com\r\nBcc: hidden@example.com'],
    extraHeaders: { 'X-Test\r\nBcc': 'bad', Bcc: 'hidden@example.com', 'List-Unsubscribe': '<https://example.com>\r\nBcc: nope' },
  });
  const headers = mime.split('\r\n\r\n')[0] ?? '';
  assert.doesNotMatch(headers, /\r\nBcc:/i);
  assert.doesNotMatch(headers, /X-Test/);
  assert.match(headers, /List-Unsubscribe: <https:\/\/example.com> Bcc: nope/);
});

test('quoted printable round trips Unicode and whitespace within the physical line limit', () => {
  const input = 'Hi 世界 '.repeat(50) + '\nend\t ';
  const encoded = quotedPrintable(input);
  assert.ok(encoded.split('\r\n').every((line) => line.length <= 76));
  const bytes = encoded.replace(/=\r\n/g, '').replace(/\r\n/g, '\n')
    .replace(/=([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  assert.equal(new TextDecoder().decode(Uint8Array.from(bytes, (c) => c.charCodeAt(0))), input);
});

test('Unicode subject words decode independently without splitting characters', () => {
  const subject = '世界'.repeat(40);
  const mime = buildMimeMessage({ ...message, subject });
  const words = [...mime.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
  assert.ok(words.length > 1);
  assert.ok(words.every((word) => word[0].length <= 75));
  assert.equal(words.map((word) => Buffer.from(word[1] ?? '', 'base64').toString('utf8')).join(''), subject);
});

test('MIME carries a plain-text alternative and base64 attachment', () => {
  const content = Buffer.from('pdf bytes').toString('base64');
  const mime = buildMimeMessage({ ...message, attachments: [{ filename: 'report.pdf', content }] });
  assert.match(mime, /Content-Type: multipart\/mixed/);
  assert.match(mime, /Content-Type: multipart\/alternative/);
  assert.match(mime, /Content-Type: text\/plain/);
  assert.match(mime, /Content-Type: text\/html/);
  assert.match(mime, /Content-Type: application\/pdf; name="report.pdf"/);
  assert.ok(mime.includes('\r\n\r\n' + content + '\r\n'));
});

test('plain text removes executable content and retains link destinations', () => {
  const text = htmlToPlainText('<head>hidden</head><script>bad()</script><p>Read <a href="https://example.com">more</a> &amp; &#x1f600;</p>');
  assert.equal(text, 'Read more (https://example.com) & 😀');
});
