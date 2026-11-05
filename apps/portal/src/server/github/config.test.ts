import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGitHubSettings } from './config.ts';
import { GITHUB_API_URL, GITHUB_WEB_URL } from './types.ts';

const KEY32 = Buffer.alloc(32, 7).toString('base64');
const PKCS8 = '-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----';

test('an empty environment switches everything off and points at github.com', () => {
  const settings = parseGitHubSettings({}, true);
  assert.deepEqual(settings, {
    app: null,
    webhookSecret: null,
    oauth: null,
    tokenEncryptionKey: null,
    apiUrl: GITHUB_API_URL,
    webUrl: GITHUB_WEB_URL,
    configError: null,
  });
});

test('values are trimmed and \\n escapes in the private key become real newlines', () => {
  const settings = parseGitHubSettings(
    {
      GITHUB_APP_ID: ' 424242 ',
      GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nQUJD\\n-----END PRIVATE KEY-----',
      GITHUB_WEBHOOK_SECRET: '  hook-secret ',
    },
    true,
  );
  assert.deepEqual(settings.app, { appId: '424242', privateKeyPem: PKCS8 });
  assert.equal(settings.webhookSecret, 'hook-secret');
  assert.equal(settings.configError, null);
});

test('CRLF line endings in the key are normalised', () => {
  const settings = parseGitHubSettings({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: PKCS8.replace(/\n/g, '\r\n') }, true);
  assert.equal(settings.app?.privateKeyPem, PKCS8);
});

test('the app needs both its id and its key', () => {
  assert.equal(parseGitHubSettings({ GITHUB_APP_ID: '1' }, true).app, null);
  assert.equal(parseGitHubSettings({ GITHUB_APP_PRIVATE_KEY: PKCS8 }, true).app, null);
  assert.equal(parseGitHubSettings({ GITHUB_APP_ID: '1' }, true).configError, null);
});

test('a PKCS#1 key (GitHub download format) is reported and switches the app off', () => {
  const settings = parseGitHubSettings(
    { GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\\nQUJD\\n-----END RSA PRIVATE KEY-----' },
    true,
  );
  assert.equal(settings.app, null);
  assert.equal(settings.configError, 'private_key_not_pkcs8');
});

test('a non-numeric app id is reported and switches the app off', () => {
  const settings = parseGitHubSettings({ GITHUB_APP_ID: 'Iv23abc', GITHUB_APP_PRIVATE_KEY: PKCS8 }, true);
  assert.equal(settings.app, null);
  assert.equal(settings.configError, 'app_id_invalid');
});

test('OAuth needs both the client id and the secret', () => {
  assert.equal(parseGitHubSettings({ GITHUB_APP_CLIENT_ID: 'Iv23x' }, true).oauth, null);
  assert.deepEqual(parseGitHubSettings({ GITHUB_APP_CLIENT_ID: 'Iv23x', GITHUB_APP_CLIENT_SECRET: 's3cret' }, true).oauth, {
    clientId: 'Iv23x',
    clientSecret: 's3cret',
  });
});

test('the token encryption key must be base64 of 32 bytes; a bad one keeps the app on', () => {
  const ok = parseGitHubSettings({ GITHUB_TOKEN_ENCRYPTION_KEY: KEY32 }, true);
  assert.equal(ok.tokenEncryptionKey, KEY32);
  assert.equal(ok.configError, null);

  for (const bad of [Buffer.alloc(16, 1).toString('base64'), 'not base64 !!', Buffer.alloc(33, 1).toString('base64')]) {
    const settings = parseGitHubSettings({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: PKCS8, GITHUB_TOKEN_ENCRYPTION_KEY: bad }, true);
    assert.equal(settings.tokenEncryptionKey, null);
    assert.equal(settings.configError, 'token_key_invalid');
    assert.ok(settings.app);
  }
});

test('an app config error is not hidden by a later token key error', () => {
  const settings = parseGitHubSettings({ GITHUB_APP_ID: 'x', GITHUB_APP_PRIVATE_KEY: PKCS8, GITHUB_TOKEN_ENCRYPTION_KEY: 'bad' }, true);
  assert.equal(settings.configError, 'app_id_invalid');
});

test('GITHUB_TEST_API_URL replaces both hosts outside production only', () => {
  const raw = { GITHUB_TEST_API_URL: 'http://127.0.0.1:4010/' };
  const dev = parseGitHubSettings(raw, false);
  assert.equal(dev.apiUrl, 'http://127.0.0.1:4010');
  assert.equal(dev.webUrl, 'http://127.0.0.1:4010');

  const prod = parseGitHubSettings(raw, true);
  assert.equal(prod.apiUrl, GITHUB_API_URL);
  assert.equal(prod.webUrl, GITHUB_WEB_URL);
});
