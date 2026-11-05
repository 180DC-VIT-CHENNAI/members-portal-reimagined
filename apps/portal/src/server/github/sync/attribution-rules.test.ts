import test from 'node:test';
import assert from 'node:assert/strict';
import { asGitHubError, decideUserFailure, safeName, withFooter } from './attribution-rules.ts';

test('only objects with a known error kind read as GitHub errors', () => {
  assert.equal(asGitHubError(new Error('x')), null);
  assert.equal(asGitHubError(null), null);
  const info = asGitHubError({ kind: 'rate_limited', status: 403, message: 'slow down', retryAfterSeconds: 30 });
  assert.equal(info?.kind, 'rate_limited');
  assert.equal(info?.retryAfterSeconds, 30);
  assert.equal(info?.documentationUrl, null);
});

test('a refused user token falls back to the App, revoking only on 401', () => {
  assert.deepEqual(decideUserFailure({ kind: 'unauthorized', status: 401, message: '', retryAfterSeconds: null, documentationUrl: null }), {
    retry: true,
    reason: 'token_revoked',
    revokeToken: true,
  });
  for (const kind of ['forbidden', 'not_found'] as const) {
    assert.deepEqual(decideUserFailure({ kind, status: 403, message: '', retryAfterSeconds: null, documentationUrl: null }), {
      retry: true,
      reason: 'user_forbidden',
      revokeToken: false,
    });
  }
  assert.deepEqual(decideUserFailure({ kind: 'unavailable', status: 502, message: '', retryAfterSeconds: null, documentationUrl: null }), { retry: false });
  assert.deepEqual(decideUserFailure(null), { retry: false });
});

test('names in the footer cannot mention or format', () => {
  assert.equal(safeName('@octo [cat](http://x) _Ann_ O\'Neil-Smith.'), 'octo cathttpx Ann O\'Neil-Smith.');
  assert.equal(withFooter('Body  ', 'issue', 'Ann Lee'), 'Body\n\n---\n_Opened from the 180DC portal by Ann Lee._');
  assert.equal(withFooter(undefined, 'comment', '***'), '---\n_Posted from the 180DC portal by a portal member._');
});
