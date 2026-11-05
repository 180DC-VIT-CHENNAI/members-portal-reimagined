import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base64Decode, base64urlEncode, openToken, sealToken } from './token-crypto.ts';

const KEY = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const OTHER_KEY = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');

test('a sealed token has the v1 format and opens for the same key, person and field', async () => {
  const sealed = await sealToken(KEY, 'person_a', 'access', 'ghu_secret');
  assert.match(sealed, /^v1\.[0-9a-f]{8}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(!sealed.includes('ghu_secret'));
  assert.equal(await openToken(KEY, 'person_a', 'access', sealed), 'ghu_secret');
});

test('sealing the same token twice gives different ciphertexts (random IV)', async () => {
  const [a, b] = await Promise.all([sealToken(KEY, 'p', 'refresh', 'ghr_x'), sealToken(KEY, 'p', 'refresh', 'ghr_x')]);
  assert.notEqual(a, b);
});

test('another key, person or field cannot open it', async () => {
  const sealed = await sealToken(KEY, 'person_a', 'access', 'ghu_secret');
  assert.equal(await openToken(OTHER_KEY, 'person_a', 'access', sealed), null);
  assert.equal(await openToken(KEY, 'person_b', 'access', sealed), null);
  assert.equal(await openToken(KEY, 'person_a', 'refresh', sealed), null);
});

test('a tampered or malformed value opens as null', async () => {
  const sealed = await sealToken(KEY, 'person_a', 'access', 'ghu_secret');
  const [version, keyId, iv, ciphertext] = sealed.split('.');
  const flipped = `${ciphertext![0] === 'A' ? 'B' : 'A'}${ciphertext!.slice(1)}`;
  assert.equal(await openToken(KEY, 'person_a', 'access', [version, keyId, iv, flipped].join('.')), null);
  assert.equal(await openToken(KEY, 'person_a', 'access', [version, keyId, iv].join('.')), null);
  assert.equal(await openToken(KEY, 'person_a', 'access', ['v2', keyId, iv, ciphertext].join('.')), null);
  assert.equal(await openToken(KEY, 'person_a', 'access', 'garbage'), null);
  assert.equal(await openToken(KEY, 'person_a', 'access', ''), null);
});

test('an unusable key throws token_key_invalid', async () => {
  const short = Buffer.alloc(16, 1).toString('base64');
  await assert.rejects(sealToken(short, 'p', 'access', 'x'), /token_key_invalid/);
  await assert.rejects(openToken('%%%', 'p', 'access', 'v1.a.b.c'), /token_key_invalid/);
});

test('base64 helpers round trip and accept both alphabets, padded or not', () => {
  const bytes = new Uint8Array([251, 255, 190, 0, 1, 2, 3]);
  const url = base64urlEncode(bytes);
  assert.match(url, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(base64Decode(url), bytes);
  assert.deepEqual(base64Decode(Buffer.from(bytes).toString('base64')), bytes);
  assert.deepEqual(base64Decode(base64urlEncode(new Uint8Array(0))), new Uint8Array(0));
});
