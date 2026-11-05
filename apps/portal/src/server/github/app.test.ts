import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';
import { createTokenSource, importAppKey, signAppJwt } from './app.ts';
import { GitHubError } from './client.ts';
import { parseGitHubSettings } from './config.ts';
import { base64Decode } from './token-crypto.ts';
import type { FetchLike } from './types.ts';

const T0 = Date.parse('2026-11-05T12:00:00Z');
const MINUTE = 60_000;

let pair: CryptoKeyPair;
let pem: string;

before(async () => {
  pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const der = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const lines = Buffer.from(der).toString('base64').match(/.{1,64}/g)!.join('\n');
  pem = `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
});

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64Decode(part))) as Record<string, unknown>;
}

async function verifies(jwt: string): Promise<boolean> {
  const [header, payload, signature] = jwt.split('.');
  return crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    pair.publicKey,
    base64Decode(signature!),
    new TextEncoder().encode(`${header}.${payload}`),
  );
}

function installationTokenBody(): string {
  return readFileSync(new URL('./fixtures/installation-token.json', import.meta.url), 'utf8');
}

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function source(respond?: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const state = { now: T0 };
  const mintAnHourFromNow = () =>
    new Response(
      JSON.stringify({ ...JSON.parse(installationTokenBody()), expires_at: new Date(state.now + 60 * MINUTE).toISOString() }),
      { status: 201 },
    );
  const fetch: FetchLike = async (url, init = {}) => {
    calls.push({ url, init });
    return (respond ?? mintAnHourFromNow)({ url, init });
  };
  const settings = parseGitHubSettings({ GITHUB_APP_ID: '424242', GITHUB_APP_PRIVATE_KEY: pem }, true);
  const tokens = createTokenSource({ settings, fetch, now: () => state.now });
  return { calls, state, tokens, settings };
}

test('importAppKey accepts a PKCS#8 PEM and rejects anything else', async () => {
  assert.ok(await importAppKey(pem));
  await assert.rejects(importAppKey('not a key'));
  await assert.rejects(importAppKey('-----BEGIN RSA PRIVATE KEY-----\nQUJD\n-----END RSA PRIVATE KEY-----'), /private_key_invalid/);
});

test('the app JWT is RS256 with iat 60 s back, exp 9 minutes out and the app id as issuer', async () => {
  const key = await importAppKey(pem);
  const nowSeconds = 1_793_880_000;
  const jwt = await signAppJwt(key, '424242', nowSeconds);

  const [header, payload] = jwt.split('.');
  assert.deepEqual(decodePart(header!), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(decodePart(payload!), { iat: nowSeconds - 60, exp: nowSeconds + 540, iss: '424242' });
  assert.equal(await verifies(jwt), true);
});

test('changing the payload invalidates the signature', async () => {
  const key = await importAppKey(pem);
  const jwt = await signAppJwt(key, '424242', 1_793_880_000);
  const other = await signAppJwt(key, '999', 1_793_880_000);
  const forged = [other.split('.')[0], other.split('.')[1], jwt.split('.')[2]].join('.');
  assert.equal(await verifies(forged), false);
});

test('an installation token is minted with the app JWT and read from the fixture', async () => {
  const { calls, tokens } = source();
  const token = await tokens.installationToken(77);

  assert.equal(token, 'ghs_fixtureInstallationToken');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.github.com/app/installations/77/access_tokens');
  assert.equal(calls[0]!.init.method, 'POST');
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.match(headers.Authorization!, /^Bearer /);
  const jwt = headers.Authorization!.slice('Bearer '.length);
  assert.equal(await verifies(jwt), true);
  assert.equal(decodePart(jwt.split('.')[1]!).iss, '424242');
  assert.equal(headers['X-GitHub-Api-Version'], '2022-11-28');
});

test('the token is cached until 5 minutes before it expires, then minted again', async () => {
  const { calls, state, tokens } = source();
  await tokens.installationToken(77);

  state.now = T0 + 54 * MINUTE;
  await tokens.installationToken(77);
  assert.equal(calls.length, 1);

  state.now = T0 + 55 * MINUTE + 1000;
  await tokens.installationToken(77);
  assert.equal(calls.length, 2);

  state.now = T0 + 56 * MINUTE;
  await tokens.installationToken(77);
  assert.equal(calls.length, 2);
});

test('installations have separate cache entries', async () => {
  const { calls, tokens } = source();
  await tokens.installationToken(1);
  await tokens.installationToken(2);
  await tokens.installationToken(1);
  assert.deepEqual(calls.map((c) => c.url.split('/')[5]), ['1', '2']);
});

test('concurrent requests for one installation share one mint', async () => {
  const { calls, tokens } = source();
  const [a, b, c] = await Promise.all([tokens.installationToken(88), tokens.installationToken(88), tokens.installationToken(88)]);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(calls.length, 1);
});

test('a failed mint is a GitHubError and is not cached', async () => {
  let attempt = 0;
  const { calls, tokens } = source(() => {
    attempt += 1;
    return attempt === 1
      ? new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
      : new Response(installationTokenBody(), { status: 201 });
  });
  await assert.rejects(tokens.installationToken(5), (err: unknown) => err instanceof GitHubError && err.kind === 'not_found');
  assert.equal(await tokens.installationToken(5), 'ghs_fixtureInstallationToken');
  assert.equal(calls.length, 2);
});

test('a malformed token response is rejected', async () => {
  const { tokens } = source(() => new Response(JSON.stringify({ token: 'x' }), { status: 201 }));
  await assert.rejects(tokens.installationToken(5), (err: unknown) => err instanceof GitHubError && err.kind === 'unavailable');
});

test('appJwt signs with the configured key and fails without an app', async () => {
  const { tokens } = source();
  assert.equal(await verifies(await tokens.appJwt()), true);

  const unconfigured = createTokenSource({
    settings: parseGitHubSettings({}, true),
    fetch: async () => new Response('{}'),
  });
  await assert.rejects(unconfigured.appJwt(), /github_not_configured/);
  await assert.rejects(unconfigured.installationToken(1), /github_not_configured/);
});
