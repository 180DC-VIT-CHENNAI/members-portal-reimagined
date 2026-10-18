import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

const ADMIN = 'srijan.guchhait@gmail.com';
let portal;
let admin;
let director; // finance director: manages finance tasks
let member; // finance member: sees finance projects
let outsider; // marketing member
let otherDirector; // marketing director
let taskManager; // finance member with a personal projects.tasks.manage grant
const ids = {};
const p = {};

async function invite(key, email, departmentId, accessRoleId) {
  const res = await admin.post('/api/people', { email, fullName: email.split('@')[0], departmentId, ...(accessRoleId ? { accessRoleId } : {}) });
  assert.equal(res.status, 201, res.text);
  ids[key] = res.json.id;
  return signIn(portal, email);
}
const txt = (name, data = 'private notes') => ({ file: { name, type: 'text/plain', data } });
const filesOf = (projectId, taskId) => `/api/projects/${projectId}${taskId ? `/tasks/${taskId}` : ''}/files`;

before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, ADMIN);
  director = await invite('director', 'pf.dir.finance@example.com', 'finance', 'director');
  member = await invite('member', 'pf.mem.finance@example.com', 'finance');
  outsider = await invite('outsider', 'pf.mem.marketing@example.com', 'marketing');
  otherDirector = await invite('otherDirector', 'pf.dir.marketing@example.com', 'marketing', 'director');
  taskManager = await invite('taskManager', 'pf.tasks.finance@example.com', 'finance');
  const grant = await admin.put(`/api/people/${ids.taskManager}/access`, { accessRoleId: 'member', grants: [{ permission: 'projects.tasks.manage', departmentId: 'finance' }] });
  assert.equal(grant.status, 200, grant.text);
  for (const [key, departmentId] of [['a', 'finance'], ['b', 'marketing']]) {
    const made = await admin.post('/api/projects', { name: `Files ${key}`, departmentIds: [departmentId] });
    assert.equal(made.status, 201, made.text);
    p[key] = made.json.id;
  }
  for (const [key, projectId] of [['ta', p.a], ['ta2', p.a], ['tb', p.b]]) {
    const made = await admin.post(`/api/projects/${projectId}/tasks`, { title: `Task ${key}` });
    assert.equal(made.status, 201, made.text);
    p[key] = made.json.id;
  }
});
after(async () => {
  await portal?.stop();
});
beforeEach(() => {
  portal.db.exec('DELETE FROM rate_limits;');
});

test('project and task files upload, list in their own scope and download privately', async () => {
  const up = await director.upload(filesOf(p.a), txt('Brief.txt', 'project brief'));
  assert.equal(up.status, 201, up.text);
  p.fileA = up.json.id;
  const onTask = await director.upload(filesOf(p.a, p.ta), txt('Survey.csv', 'q1,q2'));
  assert.equal(onTask.status, 201, onTask.text);
  p.fileTa = onTask.json.id;

  const rows = portal.db.prepare('SELECT id, key, task_id FROM project_files WHERE project_id = ? ORDER BY key').all(p.a);
  for (const row of rows) assert.match(row.key, new RegExp(`^project-files/${p.a}/${row.id}\\.(txt|csv)$`));

  const projectList = await member.get(filesOf(p.a));
  assert.equal(projectList.status, 200, projectList.text);
  assert.match(projectList.headers.get('cache-control'), /no-store/);
  assert.deepEqual(projectList.json.files.map((f) => f.id), [p.fileA]);
  assert.equal(projectList.json.files[0].fileName, 'Brief.txt');
  assert.equal(projectList.json.canUpload, false);
  assert.equal(projectList.json.canDelete, false);
  assert.deepEqual((await member.get(filesOf(p.a, p.ta))).json.files.map((f) => f.id), [p.fileTa]);
  assert.deepEqual((await member.get(filesOf(p.a, p.ta2))).json.files, []);

  const download = await member.get(`${filesOf(p.a)}/${p.fileA}/download`);
  assert.equal(download.status, 200);
  assert.equal(download.text, 'project brief');
  assert.match(download.headers.get('content-disposition'), /^attachment;.*Brief\.txt/);
  assert.match(download.headers.get('cache-control'), /private, no-store/);
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.match(download.headers.get('content-security-policy'), /sandbox/);
  const taskDownload = await member.get(`${filesOf(p.a, p.ta)}/${p.fileTa}/download`);
  assert.equal(taskDownload.status, 200);
  assert.equal(taskDownload.headers.get('content-type'), 'text/csv');
  assert.equal(taskDownload.text, 'q1,q2');
});

test('private files never appear in or are served by the shared library', async () => {
  const shared = await admin.get('/api/club-files');
  assert.equal(shared.status, 200, shared.text);
  assert.ok(!shared.json.files.some((f) => f.id === p.fileA || f.id === p.fileTa));
  assert.equal((await admin.get(`/api/club-files/${p.fileA}/download`)).status, 404);
  assert.equal((await admin.del(`/api/club-files/${p.fileA}`)).status, 404);
  assert.equal((await member.get(`${filesOf(p.a)}/${p.fileA}/download`)).status, 200);
});

test('guessed IDs never cross projects, tasks or scopes', async () => {
  for (const client of [outsider, otherDirector]) {
    assert.equal((await client.get(filesOf(p.a))).status, 404);
    assert.equal((await client.get(`${filesOf(p.a)}/${p.fileA}/download`)).status, 404);
    assert.equal((await client.get(`${filesOf(p.a, p.ta)}/${p.fileTa}/download`)).status, 404);
    assert.equal((await client.upload(filesOf(p.a), txt('x.txt'))).status, 404);
    assert.equal((await client.del(`${filesOf(p.a)}/${p.fileA}`)).status, 404);
  }
  // otherDirector manages project B's tasks but A's IDs do not resolve there.
  assert.equal((await otherDirector.get(`${filesOf(p.b)}/${p.fileA}/download`)).status, 404);
  assert.equal((await otherDirector.del(`${filesOf(p.b)}/${p.fileA}`)).status, 404);
  assert.equal((await otherDirector.get(`${filesOf(p.b, p.tb)}/${p.fileTa}/download`)).status, 404);
  // B's task under A's URL, and A's files through the wrong scope or task.
  assert.equal((await admin.get(filesOf(p.a, p.tb))).status, 404);
  assert.equal((await admin.upload(filesOf(p.a, p.tb), txt('x.txt'))).status, 404);
  assert.equal((await admin.get(`${filesOf(p.a)}/${p.fileTa}/download`)).status, 404);
  assert.equal((await admin.get(`${filesOf(p.a, p.ta)}/${p.fileA}/download`)).status, 404);
  assert.equal((await admin.get(`${filesOf(p.a, p.ta2)}/${p.fileTa}/download`)).status, 404);
  assert.equal((await admin.del(`${filesOf(p.a, p.ta2)}/${p.fileTa}`)).status, 404);
  assert.equal((await admin.get(`${filesOf(p.a)}/..%2F${p.fileA}/download`)).status, 404);
  assert.equal((await admin.get(`${filesOf(p.a)}/${p.fileA.toUpperCase()}/download`)).status, 404);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM project_files WHERE project_id = ?').get(p.b).n, 0);
});

test('upload checks: session, task management, type and size', async () => {
  const anon = anonymous(portal);
  assert.equal((await anon.get(filesOf(p.a))).status, 401);
  assert.equal((await anon.upload(filesOf(p.a), txt('x.txt'))).status, 401);
  assert.equal((await anon.get(`${filesOf(p.a)}/${p.fileA}/download`)).status, 401);
  assert.equal((await member.upload(filesOf(p.a), txt('x.txt'))).status, 403);
  assert.equal((await member.upload(filesOf(p.a, p.ta), txt('x.txt'))).status, 403);
  assert.equal((await member.del(`${filesOf(p.a)}/${p.fileA}`)).status, 403);
  assert.equal((await director.upload(filesOf(p.a), {})).status, 400);
  for (const name of ['page.html', 'icon.svg', 'tool.exe', 'noext']) {
    assert.equal((await director.upload(filesOf(p.a), txt(name, '<script>alert(1)</script>'))).status, 400, name);
  }
  assert.equal((await director.upload(filesOf(p.a), txt('empty.txt', ''))).status, 400);
  const nearLimit = await director.upload(filesOf(p.a), txt('big.txt', Buffer.alloc(25 * 1024 * 1024 + 1)));
  assert.equal(nearLimit.status, 400, nearLimit.text);
  const oversized = await director.upload(filesOf(p.a), txt('huge.txt', Buffer.alloc(26 * 1024 * 1024)));
  assert.equal(oversized.status, 400, oversized.text);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM project_files WHERE project_id = ?').get(p.a).n, 2);
});

test('revoked access ends listing, downloading and deleting; uploading grants nothing', async () => {
  const up = await taskManager.upload(filesOf(p.a, p.ta2), txt('Draft.txt'));
  assert.equal(up.status, 201, up.text);
  const revoke = await admin.put(`/api/people/${ids.taskManager}/access`, { accessRoleId: 'member', grants: [] });
  assert.equal(revoke.status, 200, revoke.text);
  assert.equal((await taskManager.del(`${filesOf(p.a, p.ta2)}/${up.json.id}`)).status, 403);
  assert.equal((await taskManager.upload(filesOf(p.a, p.ta2), txt('More.txt'))).status, 403);
  assert.equal((await taskManager.get(`${filesOf(p.a, p.ta2)}/${up.json.id}/download`)).status, 200);

  const named = await director.post(`/api/projects/${p.a}/members`, { personId: ids.outsider, role: 'Analyst' });
  assert.equal(named.status, 201, named.text);
  assert.equal((await outsider.get(`${filesOf(p.a)}/${p.fileA}/download`)).status, 200);
  assert.equal((await outsider.upload(filesOf(p.a), txt('x.txt'))).status, 403);
  assert.equal((await director.del(`/api/projects/${p.a}/members/${named.json.id}`)).status, 200);
  assert.equal((await outsider.get(filesOf(p.a))).status, 404);
  assert.equal((await outsider.get(`${filesOf(p.a)}/${p.fileA}/download`)).status, 404);

  assert.equal((await director.del(`${filesOf(p.a, p.ta2)}/${up.json.id}`)).status, 204);
  assert.equal((await director.get(`${filesOf(p.a, p.ta2)}/${up.json.id}/download`)).status, 404);
  assert.equal((await director.del(`${filesOf(p.a, p.ta2)}/${up.json.id}`)).status, 404);
  const audit = portal.db.prepare("SELECT action FROM audit_log WHERE target_type = 'project_file' AND target_id = ? ORDER BY id").all(up.json.id);
  assert.deepEqual(audit.map((r) => r.action), ['project_file.upload', 'project_file.delete']);
});

test('lists are bounded and full scopes refuse uploads', async () => {
  const made = await admin.post('/api/projects', { name: 'Full', departmentIds: ['finance'] });
  assert.equal(made.status, 201, made.text);
  const insert = portal.db.prepare("INSERT INTO project_files (id, project_id, key, file_name, content_type, bytes) VALUES (?, ?, ?, 'f.txt', 'text/plain', 1)");
  for (let i = 0; i < 100; i += 1) {
    const id = i.toString(16).padStart(32, '0');
    insert.run(id, made.json.id, `project-files/${made.json.id}/${id}.txt`);
  }
  const list = await director.get(filesOf(made.json.id));
  assert.equal(list.json.files.length, 100);
  assert.equal(list.json.canUpload, false);
  assert.equal((await director.upload(filesOf(made.json.id), txt('one-more.txt'))).status, 409);
  const missing = await director.get(`${filesOf(made.json.id)}/${'0'.repeat(32)}/download`);
  assert.equal(missing.status, 404);
});

test('removing a task removes its files from every route', async () => {
  const storedFile = portal.db.prepare('SELECT * FROM project_files WHERE id = ?').get(p.fileTa);
  assert.equal((await admin.del(`/api/projects/${p.a}/tasks/${p.ta}`)).status, 200);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM project_files WHERE id = ?').get(p.fileTa).n, 0);
  assert.equal((await admin.get(`${filesOf(p.a, p.ta)}/${p.fileTa}/download`)).status, 404);
  assert.equal((await admin.get(`${filesOf(p.a)}/${p.fileTa}/download`)).status, 404);
  assert.deepEqual((await admin.get(filesOf(p.a))).json.files.map((f) => f.id), [p.fileA]);
  assert.ok(portal.db.prepare('SELECT key FROM project_file_deletions WHERE key = ?').get(storedFile.key));
  const drain = () => fetch(portal.base + '/__void/scheduled', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-void-dev-trigger': portal.devToken },
    body: JSON.stringify({ cron: '*/5 * * * *', scheduledTime: Date.now() }),
  });
  portal.db.exec("CREATE TRIGGER reject_cleanup BEFORE DELETE ON project_file_deletions BEGIN SELECT RAISE(ABORT, 'retry cleanup'); END;");
  try {
    assert.equal((await drain()).status, 500);
    assert.ok(portal.db.prepare('SELECT key FROM project_file_deletions WHERE key = ?').get(storedFile.key));
  } finally {
    portal.db.exec('DROP TRIGGER reject_cleanup');
  }
  const drained = await drain();
  assert.equal(drained.status, 200, await drained.text());
  assert.equal(portal.db.prepare('SELECT key FROM project_file_deletions WHERE key = ?').get(storedFile.key), undefined);
  // Restoring only the metadata cannot restore deleted bytes.
  portal.db.prepare(`INSERT INTO project_files (id,project_id,key,file_name,content_type,bytes)
    VALUES (?, ?, ?, ?, ?, ?)`).run(storedFile.id, p.a, storedFile.key, storedFile.file_name, storedFile.content_type, storedFile.bytes);
  assert.equal((await admin.get(`${filesOf(p.a)}/${storedFile.id}/download`)).status, 404);
  portal.db.prepare('DELETE FROM project_files WHERE id = ?').run(storedFile.id);
});

test('concurrent uploads cannot exceed the scope limit', async () => {
  const made = await admin.post('/api/projects', { name: 'Last attachment slot', departmentIds: ['finance'] });
  const projectId = made.json.id;
  const insert = portal.db.prepare("INSERT INTO project_files (id,project_id,key,file_name,content_type,bytes) VALUES (?, ?, ?, 'f.txt', 'text/plain', 1)");
  for (let i = 0; i < 99; i++) {
    const id = crypto.randomUUID().replace(/-/g, '');
    insert.run(id, projectId, `project-files/${projectId}/${id}.txt`);
  }
  const results = await Promise.all([
    director.upload(filesOf(projectId), txt('first.txt')),
    director.upload(filesOf(projectId), txt('second.txt')),
  ]);
  assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
  assert.equal(portal.db.prepare('SELECT count(*) AS n FROM project_files WHERE project_id = ?').get(projectId).n, 100);
});

test('a failed metadata write leaves no attachment record and permits a clean retry', async () => {
  portal.db.exec("CREATE TRIGGER reject_file BEFORE INSERT ON project_files BEGIN SELECT RAISE(ABORT, 'reject file'); END;");
  try {
    assert.equal((await director.upload(filesOf(p.a), txt('retry.txt'))).status, 500);
    assert.equal(portal.db.prepare("SELECT count(*) AS n FROM project_files WHERE file_name = 'retry.txt'").get().n, 0);
  } finally {
    portal.db.exec('DROP TRIGGER reject_file');
  }
  assert.equal((await director.upload(filesOf(p.a), txt('retry.txt'))).status, 201);
});
