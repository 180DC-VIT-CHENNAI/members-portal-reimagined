import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createHash } from 'node:crypto';
import { anonymous, signIn, startPortal } from './harness.mjs';

let portal, admin, member, outsider, publicClient, projectId, taskId;
const txt = (data, name = 'Notes.txt') => ({ file: { name, type: 'text/plain', data } });
const future = () => new Date(Date.now() + 86400000).toISOString();
const doc = (id) => `/api/documents/${id}`;
const share = (id, input = {}) => admin.post(`${doc(id)}/shares`, { expiresAt: future(), ...input });
const hold = (id, legalHold) => admin.patch(`${doc(id)}/retention`, { retentionUntil: '2030-01-01', legalHold });
async function uploadProject(data = 'first') {
  const result = await admin.upload(`/api/projects/${projectId}/files`, txt(data));
  assert.equal(result.status, 201, result.text);
  return result.json.id;
}

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, 'srijan.guchhait@gmail.com');
  for (const [email, departmentId] of [['doc.finance@example.com', 'finance'], ['doc.marketing@example.com', 'marketing']]) {
    const result = await admin.post('/api/people', { email, fullName: email, departmentId });
    assert.equal(result.status, 201, result.text);
  }
  member = signIn(portal, 'doc.finance@example.com');
  outsider = signIn(portal, 'doc.marketing@example.com');
  publicClient = anonymous(portal);
  const project = await admin.post('/api/projects', { name: 'B4 private project', departmentIds: ['finance'] });
  assert.equal(project.status, 201, project.text);
  projectId = project.json.id;
  const task = await admin.post(`/api/projects/${projectId}/tasks`, { title: 'Document task' });
  assert.equal(task.status, 201, task.text);
  taskId = task.json.id;
});
after(async () => { await portal?.stop(); });
beforeEach(() => portal.db.exec('DELETE FROM rate_limits'));

test('project versions upload list download and restore without losing original bytes', async () => {
  // Given an existing private project attachment.
  const id = await uploadProject();
  const original = await member.get(`${doc(id)}/versions`);
  assert.equal(original.status, 200, original.text);
  const v1 = original.json.versions[0];
  // When a new version is uploaded and the original is restored.
  const second = await admin.upload(`${doc(id)}/versions`, txt('second', 'Updated.txt'));
  assert.equal(second.status, 201, second.text);
  assert.equal((await member.get(`/api/projects/${projectId}/files/${id}/download`)).text, 'second');
  const restored = await admin.post(`${doc(id)}/versions/${v1.id}/restore`);
  assert.equal(restored.status, 201, restored.text);
  // Then three immutable versions exist, with independent checksum evidence.
  const history = await member.get(`${doc(id)}/versions`);
  assert.deepEqual(history.json.versions.map((version) => version.number), [3, 2, 1]);
  assert.equal(history.json.versions[0].restoredFrom, v1.id);
  assert.equal(v1.checksum, createHash('sha256').update('first').digest('hex'));
  assert.ok(v1.uploadedBy);
  const oldVersion = await member.get(`${doc(id)}/versions/${v1.id}/download`);
  assert.equal(oldVersion.text, 'first');
  assert.equal(oldVersion.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  assert.equal((await member.get(`/api/projects/${projectId}/files/${id}/download`)).text, 'first');
  const privateVersions = await admin.get('/api/club-files');
  assert.ok(!privateVersions.json.files.some((file) => file.id === id));
});

test('shared files and task files use the same immutable lifecycle', async () => {
  // Given one shared file and one task attachment.
  const shared = await admin.upload('/api/club-files/upload', txt('shared'));
  const task = await admin.upload(`/api/projects/${projectId}/tasks/${taskId}/files`, txt('task'));
  // When both receive another version.
  for (const file of [shared, task]) {
    assert.equal(file.status, 201, file.text);
    assert.equal((await admin.upload(`${doc(file.json.id)}/versions`, txt('updated'))).status, 201);
  }
  // Then existing URLs serve the current version, and shared discovery stays scoped.
  assert.equal((await member.get(`/api/club-files/${shared.json.id}/download`)).text, 'updated');
  assert.equal((await member.get(`/api/projects/${projectId}/tasks/${taskId}/files/${task.json.id}/download`)).text, 'updated');
  assert.equal((await admin.get(`/api/club-files/${task.json.id}/download`)).status, 404);
});

test('outsiders cannot list versions restore or create shares on another project', async () => {
  // Given an attachment only finance can read.
  const id = await uploadProject();
  const version = (await admin.get(`${doc(id)}/versions`)).json.versions[0];
  // When an outsider tries all lifecycle entry points.
  const results = await Promise.all([
    outsider.get(`${doc(id)}/versions`),
    outsider.get(`${doc(id)}/versions/${version.id}/download`),
    outsider.post(`${doc(id)}/versions/${version.id}/restore`),
    outsider.post(`${doc(id)}/shares`, { expiresAt: future() }),
    outsider.patch(`${doc(id)}/retention`, { retentionUntil: null, legalHold: true }),
    member.upload(`${doc(id)}/versions`, txt('denied')),
  ]);
  // Then inaccessible resources are 404 and a readable but forbidden mutation is 403.
  assert.deepEqual(results.map((result) => result.status), [404, 404, 404, 404, 404, 403]);
});

test('anonymous share download is private and revocation ends access', async () => {
  // Given a share whose token is not stored in plaintext.
  const id = await uploadProject();
  const created = await share(id);
  assert.equal(created.status, 201, created.text);
  const token = created.json.url.split('/').at(-1);
  const stored = portal.db.prepare('SELECT * FROM document_shares WHERE id = ?').get(created.json.id);
  assert.equal(stored.token_hash, createHash('sha256').update(token).digest('hex'));
  const download = await publicClient.get(created.json.url);
  assert.equal(download.status, 200, download.text);
  assert.equal(download.text, 'first');
  assert.equal(download.headers.get('cache-control'), 'private, no-store');
  assert.match(download.headers.get('content-disposition'), /^attachment;/);
  // When the owner revokes it.
  assert.equal((await admin.del(`${doc(id)}/shares/${created.json.id}`)).status, 204);
  // Then anonymous retrieval is indistinguishable from missing.
  assert.equal((await publicClient.get(created.json.url)).status, 404);
  const actions = portal.db.prepare("SELECT action FROM audit_log WHERE target_id = ? AND action LIKE 'document_share.%' ORDER BY id").all(id);
  assert.deepEqual(actions.map((row) => row.action), ['document_share.create', 'document_share.revoke']);
});

test('share download limits are atomic under concurrent requests', async () => {
  // Given a one-download bearer link.
  const id = await uploadProject();
  const created = await share(id, { maxDownloads: 1 });
  // When two anonymous requests arrive together.
  const results = await Promise.all([publicClient.get(created.json.url), publicClient.get(created.json.url)]);
  // Then precisely one is admitted.
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 404]);
});

test('expired shares return 404 without waiting for wall-clock time', async () => {
  // Given a link with its expiry moved behind the request clock.
  const id = await uploadProject();
  const created = await share(id);
  portal.db.prepare('UPDATE document_shares SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', created.json.id);
  // When downloaded.
  const result = await publicClient.get(created.json.url);
  // Then expiry is enforced at request time.
  assert.equal(result.status, 404);
});

test('sign-in restricted shares require an active member session', async () => {
  // Given a sign-in restricted link.
  const id = await uploadProject();
  const created = await share(id, { requireSignIn: true });
  // When anonymous and signed-in readers try it.
  const results = await Promise.all([publicClient.get(created.json.url), member.get(created.json.url)]);
  // Then only an active member is admitted.
  assert.deepEqual(results.map((result) => result.status), [404, 200]);
});

test('shares cannot exceed thirty days and freeze the shared version', async () => {
  // Given a valid link and a later file version.
  const id = await uploadProject('original');
  const created = await share(id);
  assert.equal((await admin.upload(`${doc(id)}/versions`, txt('new'))).status, 201);
  // When the old link is downloaded and an overlong expiry requested.
  const download = await publicClient.get(created.json.url);
  const overlong = await share(id, { expiresAt: new Date(Date.now() + 31 * 86400000).toISOString() });
  // Then the link keeps its snapshot and excessive expiry is rejected.
  assert.equal(download.text, 'original');
  assert.equal(overlong.status, 400);
});

test('legal hold refuses project and shared file deletion until released', async () => {
  // Given both kinds of file on legal hold.
  const projectFile = await uploadProject();
  const shared = await admin.upload('/api/club-files/upload', txt('shared hold'));
  for (const [id, path] of [[projectFile, `/api/projects/${projectId}/files/${projectFile}`], [shared.json.id, `/api/club-files/${shared.json.id}`]]) {
    assert.equal((await hold(id, true)).status, 200);
    // When deletion is attempted.
    const result = await admin.del(path);
    // Then it fails visibly, leaves bytes readable, and succeeds only after release.
    assert.equal(result.status, 409, result.text);
    assert.equal((await member.get(`${path}/download`)).status, 200);
    assert.equal((await hold(id, false)).status, 200);
    assert.equal((await admin.del(path)).status, 204);
    assert.equal((await member.get(`${doc(id)}/versions`)).status, 404);
  }
});

test('parent task deletion queues every version for existing cleanup cron', async () => {
  // Given a task attachment with two immutable versions and a share.
  const task = await admin.post(`/api/projects/${projectId}/tasks`, { title: 'Cascade file cleanup' });
  const up = await admin.upload(`/api/projects/${projectId}/tasks/${task.json.id}/files`, txt('one'));
  const id = up.json.id;
  await admin.upload(`${doc(id)}/versions`, txt('two'));
  const created = await share(id);
  const keys = portal.db.prepare('SELECT key FROM document_versions WHERE document_id = ?').all(id).map((row) => row.key);
  // When the parent task is removed.
  assert.equal((await admin.del(`/api/projects/${projectId}/tasks/${task.json.id}`)).status, 200);
  // Then all versions are durable cleanup work and the link is no longer usable.
  for (const key of keys) assert.ok(portal.db.prepare('SELECT key FROM project_file_deletions WHERE key = ?').get(key));
  assert.equal((await publicClient.get(created.json.url)).status, 404);
  const drained = await fetch(`${portal.base}/__void/scheduled`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-void-dev-trigger': portal.devToken },
    body: JSON.stringify({ cron: '*/5 * * * *', scheduledTime: Date.now() }),
  });
  assert.equal(drained.status, 200, await drained.text());
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM project_file_deletions').get().n, 0);
});

test('legal holds also block deletion through the parent task or project', async () => {
  const task = await admin.post(`/api/projects/${projectId}/tasks`, { title: 'Held attachment' });
  assert.equal(task.status, 201, task.text);
  const uploaded = await admin.upload(`/api/projects/${projectId}/tasks/${task.json.id}/files`, txt('held bytes'));
  assert.equal(uploaded.status, 201, uploaded.text);
  const id = uploaded.json.id;
  assert.equal((await hold(id, true)).status, 200);
  assert.throws(() => portal.db.prepare('DELETE FROM project_tasks WHERE id = ?').run(task.json.id), /legal_hold/);

  for (const path of [`/api/projects/${projectId}/tasks/${task.json.id}`, `/api/projects/${projectId}`]) {
    const deleted = await admin.del(path);
    assert.equal(deleted.status, 409, deleted.text);
    assert.equal((await member.get(`${doc(id)}/versions`)).status, 200);
    assert.equal((await member.get(`/api/projects/${projectId}/tasks/${task.json.id}/files/${id}/download`)).text, 'held bytes');
  }

  assert.equal((await hold(id, false)).status, 200);
  assert.equal((await admin.del(`/api/projects/${projectId}/tasks/${task.json.id}`)).status, 200);
});

test('archiving stops version changes and shares but preserves authenticated downloads and legal holds', async () => {
  // Given a held attachment and an existing share.
  const id = await uploadProject('archived bytes');
  const created = await share(id);
  const version = (await admin.get(`${doc(id)}/versions`)).json.versions[0];
  // When a manager archives it.
  const archived = await admin.patch(`${doc(id)}/retention`, {
    retentionUntil: '2030-01-01', legalHold: true, archived: true, reviewStatus: 'approved',
  });
  assert.equal(archived.status, 200, archived.text);
  // Then archive is not erasure, and neither archive nor review approval bypasses the hold.
  assert.equal((await publicClient.get(created.json.url)).status, 404);
  assert.equal((await share(id)).status, 400);
  assert.equal((await admin.upload(`${doc(id)}/versions`, txt('replacement'))).status, 409);
  assert.equal((await admin.post(`${doc(id)}/versions/${version.id}/restore`)).status, 409);
  assert.equal((await member.get(`/api/projects/${projectId}/files/${id}/download`)).text, 'archived bytes');
  assert.equal((await admin.del(`/api/projects/${projectId}/files/${id}`)).status, 409);
  assert.equal((await hold(id, false)).status, 200);
});

test('a share stops working when its creator loses project access', async () => {
  // Given a finance member's share of a finance project attachment.
  const id = await uploadProject();
  const created = await member.post(`${doc(id)}/shares`, { expiresAt: future() });
  assert.equal(created.status, 201, created.text);
  const person = portal.db.prepare('SELECT id FROM people WHERE email = ?').get('doc.finance@example.com');
  // When the creator moves outside the project's audience.
  portal.db.prepare('UPDATE people SET department_id = ? WHERE id = ?').run('marketing', person.id);
  try {
    // Then possession of the bearer URL no longer permits downloading.
    assert.equal((await publicClient.get(created.json.url)).status, 404);
  } finally {
    portal.db.prepare('UPDATE people SET department_id = ? WHERE id = ?').run('finance', person.id);
  }
});
