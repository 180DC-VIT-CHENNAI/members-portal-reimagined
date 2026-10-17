import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SendEmailErrorCode } from 'void/email';
import { classifySend, simulatedResult } from './outcome.ts';

function requestError(code: SendEmailErrorCode) {
  return classifySend({ ok: false, error: { code, message: 'provider said no' } });
}

test('an accepted send is sent', () => {
  assert.deepEqual(classifySend({ ok: true, ids: [{ recipient: 'a@example.com', messageId: 'm1' }] }), { status: 'sent' });
});

test('provider limits pause the hour; configuration problems and outages pause without failing anyone', () => {
  assert.deepEqual(requestError('QUOTA_EXCEEDED'), { status: 'paused', error: 'QUOTA_EXCEEDED: provider said no', quota: true });
  for (const code of ['BINDING_MISSING', 'INVALID_FROM', 'UPSTREAM_ERROR'] as const) {
    assert.deepEqual(requestError(code), { status: 'paused', error: `${code}: provider said no`, quota: false });
  }
});

test('recipient and message errors fail the recipient; an unknown outcome is marked as possibly sent', () => {
  for (const code of ['INVALID_TO', 'UNVERIFIED_DESTINATION', 'MIME_ERROR', 'IDEMPOTENCY_CONFLICT'] as const) {
    assert.deepEqual(requestError(code), { status: 'failed', error: `${code}: provider said no`, mayHaveSent: false });
  }
  assert.deepEqual(requestError('OUTCOME_UNKNOWN'), { status: 'failed', error: 'OUTCOME_UNKNOWN: provider said no', mayHaveSent: true });
});

test('per-recipient results use the error of the failing delivery', () => {
  const outcome = classifySend({
    ok: false,
    deliveries: [
      { recipient: 'a@example.com', ok: true, messageId: 'm1' },
      { recipient: 'b@example.com', ok: false, error: { code: 'QUOTA_EXCEEDED', message: 'daily limit' } },
    ],
  });
  assert.deepEqual(outcome, { status: 'paused', error: 'QUOTA_EXCEEDED: daily limit', quota: true });
});

test('capture simulation accepts ordinary recipients and reports reserved domains as Void would', () => {
  assert.equal(classifySend(simulatedResult('member@example.com')).status, 'sent');
  assert.deepEqual(classifySend(simulatedResult('a@unverified.invalid')),
    { status: 'failed', error: 'UNVERIFIED_DESTINATION: simulated UNVERIFIED_DESTINATION', mayHaveSent: false });
  assert.equal(classifySend(simulatedResult('a@unknown.invalid')).status, 'failed');
  assert.ok('deliveries' in simulatedResult('a@quota.invalid'));
  assert.ok('error' in simulatedResult('a@upstream.invalid'));
});
