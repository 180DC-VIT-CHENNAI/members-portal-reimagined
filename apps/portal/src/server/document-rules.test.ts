import assert from 'node:assert/strict';
import test from 'node:test';
import { DAY_MS, sanitizeFileName, sha256, validShareExpiry } from './document-rules.ts';
import { renderKnowledgeMarkdown } from './knowledge-markdown.ts';

test('filename sanitization removes header controls and path separators', () => {
  // Given a filename from an untrusted upload.
  const filename = '../a\\b/"\r\n:c.txt';
  // When it becomes an attachment name.
  const safe = sanitizeFileName(filename);
  // Then no control, traversal prefix or separator survives.
  assert.equal(safe, '__a_b_____c.txt');
});

test('bearer token hashing produces the known SHA-256 digest', async () => {
  // Given a fixed token.
  const token = 'abc';
  // When hashed for storage.
  const hash = await sha256(token);
  // Then it matches the independently known digest, not the bearer token.
  assert.equal(hash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('share expiry accepts only future instants within thirty days', () => {
  // Given a deterministic clock.
  const now = Date.parse('2026-10-18T00:00:00Z');
  // When expiry is tested at each boundary.
  const results = [now - 1, now, now + 1, now + 30 * DAY_MS, now + 30 * DAY_MS + 1]
    .map((expires) => validShareExpiry(new Date(expires).toISOString(), now));
  // Then the interval is open at now and closed at thirty days.
  assert.deepEqual(results, [false, false, true, true, false]);
  assert.equal(validShareExpiry('invalid', now), false);
});

test('knowledge markdown escapes raw HTML without creating active links', () => {
  // Given hostile source mixed with supported formatting.
  const source = '# Guide\n<script>alert("x")</script>\n**Safe** [run](javascript:alert(1))';
  // When rendered.
  const html = renderKnowledgeMarkdown(source);
  // Then headings and emphasis work but no active markup survives.
  assert.match(html, /<h1>Guide<\/h1>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>Safe<\/strong>/);
  assert.equal(/<script|<a|onclick=/.test(html), false);
});
