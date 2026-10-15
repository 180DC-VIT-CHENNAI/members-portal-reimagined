import test from 'node:test';
import assert from 'node:assert/strict';
import { apiOrigin, memberClient, ApiError, decodeWorkQueue } from './api.ts';
test('mobile never defaults to a club host or sends credentials to malformed origins', () => {
  assert.equal(apiOrigin('https://personal.example'), 'https://personal.example');
  for (const url of [undefined, 'http://personal.example', 'https://user:pass@personal.example', 'https://personal.example/api', 'https://personal.example/']) assert.throws(() => apiOrigin(url));
});
test('token exchange and owned task requests use the shared backend contract', async () => {
  const requests = [];
  const client = memberClient('https://personal.example', async (url, options) => { requests.push({ url, options }); return Response.json(url.endsWith('/api/work-queue') ? validQueue() : { token: '180dc_session_' + 'a'.repeat(64), expiresAt: '2099-01-01T00:00:00Z', name: 'Test', email: 'test@example.invalid', powerLevel: 10 }); });
  await client.signIn('synthetic-source'); await client.queue('synthetic-device'); await client.complete('synthetic-device', 'project/id', 'task/id'); await client.logout('synthetic-device');
  assert.deepEqual(JSON.parse(requests[0].options.body), { token: 'synthetic-source', deviceLabel: 'Android' });
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[1].options.headers.Authorization, 'Bearer synthetic-device');
  assert.equal(requests[2].url, 'https://personal.example/api/projects/project%2Fid/tasks/task%2Fid');
  assert.equal(requests[3].options.method, 'POST');
});
test('revocation and permission errors retain status for credential teardown', async () => {
  const client = memberClient('https://personal.example', async () => Response.json({ error: 'Access revoked' }, { status: 401 }));
  await assert.rejects(client.queue('synthetic-device'), error => error instanceof ApiError && error.status === 401);
});
test('non-JSON revocation still carries 401; malformed success is rejected', async () => {
  const revoked = memberClient('https://personal.example', async () => new Response('unauthorized', { status: 401 }));
  await assert.rejects(revoked.queue('synthetic-device'), error => error instanceof ApiError && error.status === 401);
  const malformed = memberClient('https://personal.example', async () => new Response('<html>unexpected</html>', { status: 200 }));
  await assert.rejects(malformed.queue('synthetic-device'), /Invalid service response/);
});

function validQueue() {
  return { generatedAt: '2026-10-08T00:00:00Z', tasks: [], meetings: [], hasMoreTasks: false, hasMoreMeetings: false, attention: { incomingTransfers: 0 } };
}
test('work queue preserves truncation flags and rejects malformed protected content', () => {
  const valid = { ...validQueue(), hasMoreTasks: true, hasMoreMeetings: true };
  assert.deepEqual(decodeWorkQueue(valid), valid);
  for (const invalid of [null, {}, [], { ...valid, tasks: [null] }, { ...valid, meetings: [{}] }, { ...valid, generatedAt: 'bad' }, { ...valid, hasMoreTasks: undefined }, { ...valid, attention: { incomingTransfers: -1 } }, { ...valid, attention: { incomingTransfers: 0, accountRequests: '1' } }]) {
    assert.throws(() => decodeWorkQueue(invalid), /Invalid work queue response/);
  }
});

test('native session controls use owned-session endpoints and validate listing', async () => {
  const requests = [];
  const device = { id: 'device/id', device_label: 'Android', created_at: '2026-10-08T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', current: true };
  const client = memberClient('https://personal.example', async (url, options) => { requests.push({ url, options }); return Response.json({ success: true, data: [device] }); });
  assert.deepEqual(await client.sessions('synthetic-device'), [device]);
  await client.revoke('synthetic-device', device.id);
  assert.equal(requests[1].url, 'https://personal.example/api/auth/sessions/device%2Fid');
  assert.equal(requests[1].options.method, 'DELETE');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer synthetic-device');
  const invalid = memberClient('https://personal.example', async () => Response.json({ success: true, data: [{}] }));
  await assert.rejects(invalid.sessions('synthetic-device'), /Invalid sessions response/);
});
test('malformed session issuance is rejected before persistence', async () => {
  const client = memberClient('https://personal.example', async () => Response.json({ token: 'legacy' }));
  await assert.rejects(client.signIn('synthetic-source'), /Invalid session response/);
});
