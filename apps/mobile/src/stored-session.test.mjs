import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeStoredSession } from './stored-session.ts';
const now = Date.parse('2026-10-08T12:00:00Z');
const session = { token: '180dc_session_' + 'a'.repeat(64), expiresAt: '2026-10-09T12:00:00Z', email: 'member@example.invalid', name: 'Synthetic member', powerLevel: 10 };
test('restoration accepts only a valid expiring device session and strips unrelated fields', () => {
  assert.deepEqual(decodeStoredSession(JSON.stringify({ ...session, sourceToken: 'synthetic-source' }), now), session);
});
test('malformed, legacy, expired and invalid identity storage fails closed', () => {
  for (const raw of [null, 'invalid-json', 'null', '[]', '{}', JSON.stringify({ ...session, token: 'synthetic-registry-token' }), JSON.stringify({ ...session, expiresAt: 'invalid' }), JSON.stringify({ ...session, expiresAt: '2026-10-08T12:00:00Z' }), JSON.stringify({ ...session, email: null }), JSON.stringify({ ...session, powerLevel: -1 })]) assert.equal(decodeStoredSession(raw, now), null);
});
