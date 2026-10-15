import assert from 'node:assert/strict';

const base = new URL(process.env.LOCAL_API_URL || 'http://127.0.0.1:8787');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Local Worker only');
async function expectStatus(path, token, expected) {
  const response = await fetch(new URL(path, base), {
    headers: { Authorization: `Bearer synthetic-${token}-token` }, signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, expected, `${token} requesting ${path}`);
}
for (const token of ['board', 'director', 'member', 'advisory']) {
  await expectStatus('/api/members-directory', token, 200);
}
await expectStatus('/api/roles', 'board', 200);
for (const token of ['director', 'member', 'advisory']) await expectStatus('/api/roles', token, 403);
await expectStatus('/api/team-instances', 'advisory', 403);
await expectStatus('/api/team-instances', 'member', 200);
for (const token of ['revoked', 'expired']) await expectStatus('/api/members-directory', token, 401);
console.log('Local Worker: valid role authentication, board restriction, advisory exclusion and revoked/expired tokens verified');
