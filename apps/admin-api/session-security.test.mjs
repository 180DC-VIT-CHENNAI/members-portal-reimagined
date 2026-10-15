import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeRegistryToken, credentialHash, newSessionCredential, SESSION_PREFIX } from './session-security.ts';

test('session credentials have independent cryptographic randomness and hashes', async () => {
  const first = newSessionCredential();
  const second = newSessionCredential();
  assert.match(first, new RegExp(`^${SESSION_PREFIX}[a-f0-9]{64}$`));
  assert.notEqual(first, second);
  assert.match(await credentialHash(first), /^[a-f0-9]{64}$/);
  assert.notEqual(await credentialHash(first), await credentialHash(second));
  assert.equal(await credentialHash(first), await credentialHash(first));
});

test('registry state validates SQL and ISO UTC expiries and fails closed on invalid dates', () => {
  const now = Date.parse('2026-10-08T00:00:00Z');
  assert.equal(activeRegistryToken({ expires_at: '2026-10-09 00:00:00' }, now), true);
  assert.equal(activeRegistryToken({ expires_at: '2026-10-09T00:00:00Z' }, now), true);
  for (const row of [null, { revoked_at: '2026-01-01' }, { expires_at: 'invalid' }, { expires_at: '2026-10-08T00:00:00Z' }, { expires_at: '2026-01-01 00:00:00' }]) {
    assert.equal(activeRegistryToken(row, now), false);
  }
});
