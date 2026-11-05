import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { sha256Hex, verifySignature } from './verify.ts';

const encoder = new TextEncoder();
const body = (text: string) => encoder.encode(text);

test("GitHub's documented example verifies", async () => {
  const signature = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';
  assert.equal(await verifySignature("It's a Secret to Everybody", body('Hello, World!'), signature), true);
});

test('a signature made here verifies, and any change to secret, body or header does not', async () => {
  const payload = '{"action":"opened"}';
  const sign = (secret: string, text: string) => `sha256=${createHmac('sha256', secret).update(text).digest('hex')}`;
  assert.equal(await verifySignature('s3cret', body(payload), sign('s3cret', payload)), true);
  assert.equal(await verifySignature('other', body(payload), sign('s3cret', payload)), false);
  assert.equal(await verifySignature('s3cret', body(`${payload} `), sign('s3cret', payload)), false);
  assert.equal(await verifySignature('s3cret', body(payload), sign('s3cret', payload).replace(/.$/, (c) => (c === '0' ? '1' : '0'))), false);
});

test('missing, unprefixed, short, long and non-hex headers are refused', async () => {
  const hex = createHmac('sha256', 's').update('x').digest('hex');
  for (const header of [undefined, null, '', hex, `sha1=${hex}`, `sha256=${hex.slice(1)}`, `sha256=${hex}00`, `sha256=${hex.replace(/^./, 'z')}`, `SHA256=${hex}`]) {
    assert.equal(await verifySignature('s', body('x'), header), false, String(header));
  }
});

test('an empty secret never verifies, even against the MAC computed with it', async () => {
  const header = `sha256=${createHmac('sha256', '').update('x').digest('hex')}`;
  assert.equal(await verifySignature('', body('x'), header), false);
});

test('uppercase hex digits are not accepted, since GitHub sends lower case', async () => {
  const header = `sha256=${createHmac('sha256', 's').update('x').digest('hex').toUpperCase()}`;
  assert.equal(await verifySignature('s', body('x'), header), false);
});

test('sha256Hex matches the known digest of an empty body', async () => {
  assert.equal(await sha256Hex(new Uint8Array()), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
