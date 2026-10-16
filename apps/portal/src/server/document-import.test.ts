import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { importDocument } from './document-import.ts';

const pdf = (stream: Buffer | string, title = '') =>
  Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj\n<< ${title ? `/Title (${title})` : ''} >>\nendobj\n2 0 obj\n<< /Length 10 >>\nstream\n`, 'latin1'),
    Buffer.isBuffer(stream) ? stream : Buffer.from(stream, 'latin1'),
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);

const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

test('reads text from plain and deflated PDF streams and escapes it', async () => {
  const text = 'BT (Growth strategy for a rural co-op) Tj ET\nBT (Second paragraph <b>about pricing</b>) Tj ET';
  for (const body of [text, deflateSync(Buffer.from(text, 'latin1'))]) {
    const doc = await importDocument('pdf', toArrayBuffer(pdf(body)));
    assert.ok(doc);
    assert.match(doc.content, /<p>Growth strategy for a rural co-op<\/p>/);
    assert.ok(!doc.content.includes('<b>'), 'document text is escaped, not trusted as HTML');
    assert.equal(doc.suggestedTitle, 'Growth strategy for a rural co-op');
  }
});

test('prefers the PDF /Title and rejects documents without text', async () => {
  const doc = await importDocument('pdf', toArrayBuffer(pdf('BT (Some long enough body text) Tj ET', 'Official title')));
  assert.equal(doc?.suggestedTitle, 'Official title');
  assert.equal(await importDocument('pdf', toArrayBuffer(pdf('BT ET'))), null);
});
