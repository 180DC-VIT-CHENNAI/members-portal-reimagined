import assert from 'node:assert/strict';

const base = new URL(process.env.LOCAL_API_URL || 'http://127.0.0.1:8787');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) {
  throw new Error('This verification script only exercises a local Worker');
}
const allowed = process.env.TEST_WEB_ORIGIN || 'https://personal.example';
async function request(path, options) {
  return fetch(new URL(path, base), { ...options, signal: AbortSignal.timeout(15000) });
}

const departments = await request('/api/departments');
assert.equal(departments.status, 200, 'Empty local database must initialise successfully');
assert.equal((await request('/api/projects')).status, 401, 'Private routes require a member token');
assert.equal((await request('/api/projects', { headers: { Authorization: 'Bearer nonexistent-synthetic-token' } })).status, 401);

const preflight = await request('/api/dev-login', {
  method: 'OPTIONS', headers: { Origin: allowed, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
});
assert.equal(preflight.headers.get('access-control-allow-origin'), allowed);
const login = await request('/api/dev-login', {
  method: 'POST', headers: { Origin: allowed, 'Content-Type': 'application/json' }, body: '{}',
});
assert.equal(login.status, 400, 'Permitted origin must reach request validation');
assert.equal(login.headers.get('access-control-allow-origin'), allowed);

const forbidden = await request('/api/dev-login', {
  method: 'POST', headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json' }, body: '{}',
});
assert.equal(forbidden.status, 403, 'Unrelated origin must fail CSRF');
assert.equal(forbidden.headers.get('access-control-allow-origin'), null);
console.log('Local Worker: schema bootstrap, missing/invalid auth, allowed CORS and rejected CSRF verified');
