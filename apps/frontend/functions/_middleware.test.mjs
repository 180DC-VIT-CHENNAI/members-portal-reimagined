import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequest, resolveApiOrigin } from './_middleware.ts';

test('API origin accepts HTTPS and local development, preserves legacy default', () => {
  assert.equal(resolveApiOrigin(undefined), 'https://admin-api.technical-vitc.workers.dev');
  assert.equal(resolveApiOrigin('https://personal-api.example/'), 'https://personal-api.example');
  assert.equal(resolveApiOrigin('http://127.0.0.1:8787'), 'http://127.0.0.1:8787');
  for (const value of ['', null, 'http://remote.example', 'https://user:password@example.com', 'https://example.com/api', 'https://example.com?secret=x', "https://example.com/#unsafe", 'file:///tmp/api']) {
    assert.throws(() => resolveApiOrigin(value));
  }
});

test('proxy forwards method, auth, body and query only to configured origin', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
  });
  const response = await onRequest({
    request: new Request('https://personal-site.example/api/tasks?project=123', {
      method: 'POST', headers: { authorization: 'Bearer synthetic-token' }, body: '{"status":"done"}',
    }),
    env: { API_ORIGIN: 'https://personal-api.example' },
    next: () => { throw new Error('API must not serve SPA'); },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://personal-api.example/api/tasks?project=123');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.get('authorization'), 'Bearer synthetic-token');
  assert.equal(requests[0].options.headers.get('host'), 'personal-api.example');
  assert.equal(requests[0].options.redirect, 'manual');
  assert.equal(await new Response(requests[0].options.body).text(), '{"status":"done"}');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(response.headers.get('content-security-policy'), /https:\/\/personal-api.example wss:\/\/personal-api.example/);
  assert.doesNotMatch(response.headers.get('content-security-policy'), /technical-vitc/);
});

test('invalid configuration fails closed without forwarding credentials', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not fetch'); });
  const response = await onRequest({
    request: new Request('https://site.example/api/members', { headers: { authorization: 'Bearer synthetic-token' } }),
    env: { API_ORIGIN: 'https://user:secret@example.com' },
  });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('static and SPA responses use configured security headers', async () => {
  const env = { API_ORIGIN: 'https://personal-api.example', ASSETS: { fetch: async () => new Response('<main>App</main>') } };
  const asset = await onRequest({ request: new Request('https://site.example/assets/app.js'), env, next: async () => new Response('export {}') });
  assert.equal(asset.headers.get('content-type'), 'text/javascript');
  const spa = await onRequest({ request: new Request('https://site.example/members'), env, next: async () => new Response(null, { status: 404 }) });
  assert.equal(spa.status, 200);
  assert.equal(await spa.text(), '<main>App</main>');
  assert.match(spa.headers.get('content-security-policy'), /personal-api.example/);
});
