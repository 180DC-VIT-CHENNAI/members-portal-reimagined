import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomToken, tokenHash } from './tokens.ts';

test('random subscription credentials have the requested byte length', () => {
  for (const bytes of [24, 32]) assert.match(randomToken(bytes), new RegExp(`^[a-f0-9]{${bytes * 2}}$`));
});
test('token hashes are SHA-256, not recoverable raw credentials', async () => {
  assert.equal(await tokenHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
