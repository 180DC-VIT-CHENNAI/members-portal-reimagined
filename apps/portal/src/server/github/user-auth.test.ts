import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { GitHubError } from './client.ts';
import { parseGitHubSettings } from './config.ts';
import type { FetchLike } from './types.ts';
import { authorizeUrl, exchangeCode, pkcePair, refreshUserToken, revokeUserToken } from './user-auth.ts';

const settings = parseGitHubSettings({ GITHUB_APP_CLIENT_ID: 'Iv23test', GITHUB_APP_CLIENT_SECRET: 'client-secret' }, true);
const NOW = Date.parse('2026-11-05T12:00:00Z');
const now = () => NOW;

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function stub(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init = {}) => {
    calls.push({ url, init });
    return respond({ url, init });
  };
  return { calls, fetch };
}

function tokenResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sentBody(call: Call): Record<string, unknown> {
  return JSON.parse(call.init.body as string) as Record<string, unknown>;
}

async function failure(promise: Promise<unknown>): Promise<GitHubError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof GitHubError, 'expected a GitHubError');
    return err;
  }
  assert.fail('expected the call to fail');
}

test('a PKCE pair is a 32-byte verifier and its S256 challenge', async () => {
  const { verifier, challenge } = await pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
  assert.notEqual((await pkcePair()).verifier, verifier);
});

test('the authorize URL carries the state, the S256 challenge and no secret', () => {
  const url = new URL(authorizeUrl(settings, { state: 'st4te', challenge: 'chal', redirectUri: 'https://180dc.vitcc.org/api/github/link/callback' }));
  assert.equal(url.origin + url.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'Iv23test');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://180dc.vitcc.org/api/github/link/callback');
  assert.equal(url.searchParams.get('state'), 'st4te');
  assert.equal(url.searchParams.get('code_challenge'), 'chal');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('allow_signup'), 'false');
  assert.ok(!url.toString().includes('client-secret'));
});

test('authorizing without the OAuth pair fails with linking_not_configured', () => {
  assert.throws(
    () => authorizeUrl(parseGitHubSettings({}, true), { state: 's', challenge: 'c', redirectUri: 'r' }),
    /linking_not_configured/,
  );
});

test('exchangeCode posts the code and verifier and computes the expiries', async () => {
  const { calls, fetch } = stub(() =>
    tokenResponse({ access_token: 'ghu_access', expires_in: 28800, refresh_token: 'ghr_refresh', refresh_token_expires_in: 15811200, token_type: 'bearer' }),
  );
  const grant = await exchangeCode(settings, fetch, { code: 'c0de', verifier: 'v3rifier', redirectUri: 'https://x/cb' }, now);

  assert.deepEqual(grant, {
    accessToken: 'ghu_access',
    accessTokenExpiresAt: new Date(NOW + 28800 * 1000).toISOString(),
    refreshToken: 'ghr_refresh',
    refreshTokenExpiresAt: new Date(NOW + 15811200 * 1000).toISOString(),
  });
  const call = calls[0]!;
  assert.equal(call.url, 'https://github.com/login/oauth/access_token');
  assert.equal(call.init.method, 'POST');
  assert.equal((call.init.headers as Record<string, string>).Accept, 'application/json');
  assert.deepEqual(sentBody(call), {
    client_id: 'Iv23test',
    client_secret: 'client-secret',
    code: 'c0de',
    redirect_uri: 'https://x/cb',
    code_verifier: 'v3rifier',
  });
});

test('a token that never expires has null expiries and no refresh token', async () => {
  const { fetch } = stub(() => tokenResponse({ access_token: 'ghu_forever', token_type: 'bearer' }));
  const grant = await exchangeCode(settings, fetch, { code: 'c', verifier: 'v', redirectUri: 'r' }, now);
  assert.deepEqual(grant, { accessToken: 'ghu_forever', accessTokenExpiresAt: null, refreshToken: null, refreshTokenExpiresAt: null });
});

test('a 200 carrying an error code throws a validation GitHubError with that code', async () => {
  const { fetch } = stub(() => tokenResponse({ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' }));
  const err = await failure(exchangeCode(settings, fetch, { code: 'c', verifier: 'v', redirectUri: 'r' }));
  assert.equal(err.kind, 'validation');
  assert.equal(err.message, 'bad_verification_code');
});

test('HTTP failures and an empty token response are GitHubErrors', async () => {
  const down = stub(() => tokenResponse({ message: 'down' }, 502));
  assert.equal((await failure(exchangeCode(settings, down.fetch, { code: 'c', verifier: 'v', redirectUri: 'r' }))).kind, 'unavailable');

  const empty = stub(() => tokenResponse({ token_type: 'bearer' }));
  assert.equal((await failure(exchangeCode(settings, empty.fetch, { code: 'c', verifier: 'v', redirectUri: 'r' }))).kind, 'unavailable');
});

test('refreshUserToken sends the refresh grant and parses the new pair', async () => {
  const { calls, fetch } = stub(() => tokenResponse({ access_token: 'ghu_new', expires_in: 28800, refresh_token: 'ghr_new', refresh_token_expires_in: 100 }));
  const grant = await refreshUserToken(settings, fetch, 'ghr_old', now);

  assert.equal(grant.accessToken, 'ghu_new');
  assert.equal(grant.refreshToken, 'ghr_new');
  assert.equal(grant.refreshTokenExpiresAt, new Date(NOW + 100_000).toISOString());
  assert.deepEqual(sentBody(calls[0]!), {
    client_id: 'Iv23test',
    client_secret: 'client-secret',
    grant_type: 'refresh_token',
    refresh_token: 'ghr_old',
  });
});

test('a refused refresh token surfaces as bad_refresh_token', async () => {
  const { fetch } = stub(() => tokenResponse({ error: 'bad_refresh_token' }));
  const err = await failure(refreshUserToken(settings, fetch, 'ghr_old'));
  assert.equal(err.kind, 'validation');
  assert.equal(err.message, 'bad_refresh_token');
});

test('revokeUserToken deletes the grant with basic client authentication', async () => {
  const { calls, fetch } = stub(() => new Response(null, { status: 204 }));
  await revokeUserToken(settings, fetch, 'ghu_access');

  const call = calls[0]!;
  assert.equal(call.url, 'https://api.github.com/applications/Iv23test/token');
  assert.equal(call.init.method, 'DELETE');
  assert.equal((call.init.headers as Record<string, string>).Authorization, `Basic ${Buffer.from('Iv23test:client-secret').toString('base64')}`);
  assert.deepEqual(sentBody(call), { access_token: 'ghu_access' });
});

test('revoking a token GitHub no longer knows succeeds; other failures throw', async () => {
  const gone = stub(() => tokenResponse({ message: 'Not Found' }, 404));
  await revokeUserToken(settings, gone.fetch, 'ghu_access');

  const broken = stub(() => tokenResponse({ message: 'boom' }, 500));
  assert.equal((await failure(revokeUserToken(settings, broken.fetch, 'ghu_access'))).kind, 'unavailable');
});
