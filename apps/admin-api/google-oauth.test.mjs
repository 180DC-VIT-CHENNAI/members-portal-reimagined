import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeGoogleCode, googleAuthorizeUrl, identityFromClaims, pkceChallenge, GoogleOAuthError } from './google-oauth.ts';

const CLIENT = 'client-123.apps.googleusercontent.com';
const now = () => Math.floor(Date.now() / 1000);
const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
const valid = (over = {}) => ({ iss: 'https://accounts.google.com', aud: CLIENT, exp: now() + 300, sub: '1234567890', email: 'A@Example.com', email_verified: true, ...over });

test('PKCE challenge is the RFC 7636 S256 transform', async () => {
  assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('authorize URL requests code flow with PKCE and the given state', () => {
  const url = new URL(googleAuthorizeUrl({ clientId: CLIENT, redirectUri: 'https://x.test/api/auth/google/callback', state: 's1', challenge: 'c1' }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 's1');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
});

test('claims are accepted only from Google, for this client, unexpired, with a subject', () => {
  const id = identityFromClaims(valid(), CLIENT);
  assert.deepEqual(id, { sub: '1234567890', email: 'a@example.com', emailVerified: true, name: null });
  for (const bad of [valid({ iss: 'https://evil.example' }), valid({ aud: 'other-client' }), valid({ exp: now() - 1 }), valid({ sub: '' })]) {
    assert.throws(() => identityFromClaims(bad, CLIENT), GoogleOAuthError);
  }
});

test('code exchange posts the verifier and secret, and validates the returned ID token', async () => {
  let sent;
  const fetcher = async (url, init) => {
    sent = { url, body: Object.fromEntries(new URLSearchParams(init.body.toString())) };
    return new Response(JSON.stringify({ id_token: jwt(valid()) }), { status: 200 });
  };
  const id = await exchangeGoogleCode({ code: 'c', verifier: 'v', clientId: CLIENT, clientSecret: 's', redirectUri: 'https://x.test/cb', fetcher });
  assert.equal(id.sub, '1234567890');
  assert.equal(sent.url, 'https://oauth2.googleapis.com/token');
  assert.deepEqual(sent.body, { grant_type: 'authorization_code', code: 'c', code_verifier: 'v', client_id: CLIENT, client_secret: 's', redirect_uri: 'https://x.test/cb' });
});

test('a failed exchange or a token for another client is rejected', async () => {
  const deny = async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
  await assert.rejects(exchangeGoogleCode({ code: 'c', verifier: 'v', clientId: CLIENT, clientSecret: 's', redirectUri: 'r', fetcher: deny }), /invalid_grant/);
  const other = async () => new Response(JSON.stringify({ id_token: jwt(valid({ aud: 'someone-else' })) }), { status: 200 });
  await assert.rejects(exchangeGoogleCode({ code: 'c', verifier: 'v', clientId: CLIENT, clientSecret: 's', redirectUri: 'r', fetcher: other }), /audience/);
});
