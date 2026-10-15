// Hermetic local-only route test. Uses the real Clerk verifier with an ephemeral RSA key.
// The generated test entry substitutes only verification key lookup; it is never deployed.
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
const cwd = fileURLToPath(new URL('../apps/admin-api/', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/.bin/wrangler', import.meta.url));
const state = mkdtempSync(join(tmpdir(), '180dc-clerk-local-'));
const entry = join(cwd, `.clerk-verification-${randomUUID()}.ts`);
const config = join(state, 'wrangler.toml');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const port = await new Promise(resolve => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const base = `http://127.0.0.1:${port}`;
let worker;
let log = '';
const expectedImport = 'import { verifyToken } from "@clerk/backend";';
const original = readFileSync(join(cwd, 'index.ts'), 'utf8');
assert.equal(original.split(expectedImport).length, 2, 'Test must replace exactly the SDK verification import');
const jwt = (sub = 'user_synthetic_member', patch = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'synthetic' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub, sid: 'sess_synthetic', iss: 'https://synthetic.clerk.accounts.dev', azp: 'https://personal.example', iat: now, nbf: now - 5, exp: now + 600, ...patch })).toString('base64url');
  const message = `${head}.${body}`;
  return `${message}.${sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64url')}`;
};
function sql(command) {
  return JSON.parse(execFileSync(wrangler, ['d1', 'execute', 'DB', '--config', config, '--local', '--persist-to', state, '--json', '--command', command], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0].results;
}
async function post(path, body, memberToken, status = 200) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Origin: 'https://personal.example',
    ...(memberToken ? { Authorization: `Bearer ${memberToken}` } : {}),
  }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  assert.equal(response.status, status, `${path}: ${data.error || 'unexpected success/status'}`);
  return data;
}
async function stop() {
  if (worker && worker.exitCode === null) {
    worker.kill('SIGTERM');
    await Promise.race([new Promise(resolve => worker.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (worker.exitCode === null) worker.kill('SIGKILL');
  }
}
async function boot() {
  worker = spawn(wrangler, ['dev', '--config', config, '--local', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', state], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  worker.stdout.on('data', data => { log += data; });
  worker.stderr.on('data', data => { log += data; });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (worker.exitCode !== null) throw new Error(`Local fixture Worker exited: ${log}`);
    try { const response = await fetch(`${base}/api/departments`, { signal: AbortSignal.timeout(1000) }); ready = response.status === 200; } catch { /* awaiting boot */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, `Local fixture Worker failed to bootstrap: ${log}`);
}
try {
  writeFileSync(entry, original.replace(expectedImport, `import { verifyToken as sdkVerifyToken } from "@clerk/backend";\nconst verifyToken = (token: string, _options: any) => sdkVerifyToken(token, { jwtKey: ${JSON.stringify(pem)} });`));
  writeFileSync(config, `name = "180dc-clerk-local-test"\nmain = ${JSON.stringify(entry)}\ncompatibility_date = "2024-04-05"\ncompatibility_flags = ["nodejs_compat"]\n[vars]\nENVIRONMENT = "production"\nALLOWED_WEB_ORIGINS = "https://personal.example"\nCLERK_SECRET_KEY = "synthetic-unused-no-provider-network"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "local-clerk-fixture"\ndatabase_id = "00000000-0000-0000-0000-000000000001"\n[[d1_databases]]\nbinding = "NEWSLETTER_DB"\ndatabase_name = "local-clerk-newsletter-fixture"\ndatabase_id = "00000000-0000-0000-0000-000000000002"\n[[r2_buckets]]\nbinding = "CLUB_FILES"\nbucket_name = "local-club-fixture"\n`);
  await boot();
  execFileSync(wrangler, ['d1', 'execute', 'DB', '--config', config, '--local', '--persist-to', state, '--file', fileURLToPath(new URL('./fixtures/local-auth.sql', import.meta.url))], { cwd, stdio: 'pipe' });
  // Shared library must never traverse the Letter Studio/private namespace.
  const privateFile = join(state, 'private-fixture.pdf');
  writeFileSync(privateFile, 'synthetic confidential letter');
  for (const key of ['letters/synthetic-private.pdf', 'general/nested/synthetic-private.pdf']) {
    execFileSync(wrangler, ['r2', 'object', 'put', `local-club-fixture/${key}`, '--config', config, '--local', '--persist-to', state, '--file', privateFile], { cwd, stdio: 'pipe' });
  }
  async function fileCall(path, token = 'synthetic-member-token', method = 'GET', body) {
    return fetch(`${base}${path}`, { method, headers: { Origin: 'https://personal.example', Authorization: `Bearer ${token}` }, body });
  }
  async function upload(category, token = 'synthetic-director-token') {
    const form = new FormData();
    form.append('file', new Blob(['synthetic shared file'], { type: 'application/pdf' }), 'shared.pdf');
    form.append('category', category); form.append('projectName', 'Synthetic project'); form.append('eventName', 'Synthetic event');
    return fileCall('/api/club-files/upload', token, 'POST', form);
  }
  assert.equal((await upload('general', 'synthetic-member-token')).status, 403);
  assert.equal((await upload('letters')).status, 400);
  const shared = await upload('general'); assert.equal(shared.status, 200); const sharedId = (await shared.json()).id;
  assert.equal((await upload('projects')).status, 200);
  assert.equal((await upload('events')).status, 200);
  const library = await (await fileCall('/api/club-files')).json();
  assert.equal(library.files.length, 3);
  assert.ok(library.files.every(file => ['general', 'projects', 'events'].includes(file.category)));
  assert.equal((await fileCall('/api/club-files?category=letters')).status, 400);
  assert.deepEqual((await (await fileCall('/api/club-files/projects')).json()).projects, ['Synthetic project']);
  assert.deepEqual((await (await fileCall('/api/club-files/events')).json()).events, ['Synthetic event']);
  const download = await fileCall(`/api/club-files/${sharedId}/download`);
  assert.equal(download.status, 200); assert.equal(await download.text(), 'synthetic shared file');
  assert.equal(download.headers.get('cache-control'), 'private, no-store');
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fileCall(`/api/club-files/${sharedId.slice(0, 8)}/download`)).status, 404);
  for (const token of ['synthetic-member-token', 'synthetic-board-token']) assert.equal((await fileCall('/api/club-files/synthetic-private/download', token)).status, 404);
  assert.equal((await fileCall('/api/club-files/synthetic-private', 'synthetic-board-token', 'DELETE')).status, 404);
  assert.equal((await fileCall(`/api/club-files/${sharedId}`, 'synthetic-member-token', 'DELETE')).status, 403);
  assert.equal((await fileCall(`/api/club-files/${sharedId}`, 'synthetic-director-token', 'DELETE')).status, 200);
  assert.equal((await fileCall(`/api/club-files/${sharedId}/download`)).status, 404);
  const preserved = execFileSync(wrangler, ['r2', 'object', 'get', 'local-club-fixture/letters/synthetic-private.pdf', '--config', config, '--local', '--persist-to', state, '--pipe'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.ok(preserved.toString().includes('synthetic confidential letter'));
  execFileSync(wrangler, ['d1', 'execute', 'DB', '--config', config, '--local', '--persist-to', state, '--file', fileURLToPath(new URL('./fixtures/local-projects.sql', import.meta.url))], { cwd, stdio: 'pipe' });
  // Recreate the older task column layout in this isolated fixture, then exercise real runtime migrations.
  await stop();
  sql("ALTER TABLE project_tasks DROP COLUMN due_date");
  sql("ALTER TABLE project_tasks DROP COLUMN priority");
  await boot();
  const migratedTask = sql("SELECT id, status, due_date IS NULL AS has_no_due, priority FROM project_tasks WHERE id = 'fixture-task-tech'")[0];
  assert.equal(migratedTask.id, 'fixture-task-tech'); assert.equal(migratedTask.status, 'pending');
  assert.equal(migratedTask.has_no_due, 1); assert.equal(migratedTask.priority, 'normal');
  sql("INSERT INTO project_tasks (id, project_id, title, assigned_to) VALUES ('fixture-task-hidden', 'fixture-project-finance', 'Synthetic inaccessible assignment', 'fixture-member'), ('fixture-task-explicit', 'fixture-project-explicit', 'Synthetic explicit assignment', 'fixture-member'), ('fixture-task-advisory', 'fixture-project-explicit', 'Synthetic advisory assignment', 'fixture-advisory')");
  sql("UPDATE projects SET deadline = datetime('now', '-1 day') WHERE id = 'fixture-project-tech'");
  sql("INSERT INTO club_meets (id, title, scheduled_at) VALUES ('fixture-queue-club', 'Synthetic club meeting', datetime('now', '+1 day')), ('fixture-queue-past', 'Synthetic old meeting', datetime('now', '-2 days'))");
  sql("INSERT INTO department_meets (id, department_id, title, scheduled_at) VALUES ('fixture-queue-tech', 'tech', 'Synthetic technical meeting', datetime('now', '+1 day')), ('fixture-queue-finance', 'finance', 'Synthetic finance meeting', datetime('now', '+1 day'))");
  sql("INSERT INTO role_transfers (id, from_user_id, to_user_id, role_id) VALUES ('fixture-queue-transfer', 'fixture-director', 'fixture-member', 'member')");
  async function queue(token = 'synthetic-member-token') {
    const response = await fileCall('/api/work-queue', token); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store'); return response.json();
  }
  async function schedule(role, body, project = 'fixture-project-tech', task = 'fixture-task-tech') {
    return fetch(`${base}/api/projects/${project}/tasks/${task}/schedule`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: 'https://personal.example', Authorization: `Bearer synthetic-${role}-token` }, body: JSON.stringify(body) });
  }
  const preflight = await fetch(`${base}/api/projects/fixture-project-tech/tasks/fixture-task-tech/schedule`, { method: 'OPTIONS', headers: { Origin: 'https://personal.example', 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'Authorization, Content-Type' } });
  assert.ok(preflight.headers.get('access-control-allow-methods')?.split(',').map(m => m.trim()).includes('PATCH'));
  await post('/api/projects/fixture-project-tech/tasks', { title: 'Synthetic scheduled creation', dueDate: '2028-02-29', priority: 'urgent' }, 'synthetic-board-token');
  const createdSchedule = sql("SELECT due_date, priority FROM project_tasks WHERE title = 'Synthetic scheduled creation'")[0];
  assert.equal(createdSchedule.due_date, '2028-02-29'); assert.equal(createdSchedule.priority, 'urgent');
  await post('/api/projects/fixture-project-tech/tasks', { title: 'Synthetic invalid date', dueDate: '2026-02-29' }, 'synthetic-board-token', 400);
  assert.equal((await schedule('member', { dueDate: '2026-10-12' })).status, 403);
  assert.equal((await schedule('director', { priority: 'high' })).status, 404);
  assert.equal((await schedule('board', { dueDate: '2026-02-29' })).status, 400);
  assert.equal((await schedule('board', { priority: 'invalid' })).status, 400);
  assert.equal((await schedule('board', {})).status, 400);
  assert.equal((await schedule('board', { priority: 'high' }, 'fixture-project-tech', 'fixture-task-finance')).status, 404);
  assert.equal((await schedule('board', { dueDate: '2026-10-12', priority: 'urgent' })).status, 200);
  assert.equal((await schedule('board', { priority: 'high' })).status, 200);
  const scheduled = (await queue()).tasks.find(t => t.id === 'fixture-task-tech');
  assert.equal((await queue()).tasks[0].id, 'fixture-task-tech', 'Task due date drives ordering');
  assert.equal(scheduled.due_date, '2026-10-12'); assert.equal(scheduled.priority, 'high');
  const audits = sql("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'task_schedule_changed' AND target_id = 'fixture-task-tech'");
  assert.equal(audits[0].count, 2);
  assert.equal((await schedule('board', { priority: 'high' })).status, 200);
  assert.deepEqual(sql("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'task_schedule_changed' AND target_id = 'fixture-task-tech'"), audits);
  assert.equal((await schedule('board', { dueDate: null, priority: 'normal' })).status, 200);
  console.log('Task scheduling: date validation, partial updates, scoped lead-only edits, queue visibility and idempotent transactional audit verified');
  sql("INSERT INTO users (id, name, email, role_id, department_id) VALUES ('fixture-colleague', 'Synthetic Colleague', 'colleague@example.invalid', 'member', 'tech')");
  sql("INSERT INTO admin_tokens (token, email, name, role_id) VALUES ('synthetic-colleague-token', 'colleague@example.invalid', 'Synthetic Colleague', 'member')");
  async function details(role, body, project = 'fixture-project-tech', task = 'fixture-task-tech') {
    return fetch(`${base}/api/projects/${project}/tasks/${task}/details`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: 'https://personal.example', Authorization: `Bearer synthetic-${role}-token` }, body: JSON.stringify(body) });
  }
  const previous = { assignedTo: 'fixture-member', dueDate: null, priority: 'normal' };
  assert.equal((await details('member', { assignedTo: 'fixture-colleague', expected: previous })).status, 403);
  assert.equal((await details('director', { assignedTo: 'fixture-colleague', expected: previous })).status, 404);
  assert.equal((await details('board', { assignedTo: 'fixture-colleague' })).status, 400);
  for (const assignedTo of ['fixture-director', 'fixture-revoked', 'fixture-expired', 'nonexistent', '', {}, 1]) assert.equal((await details('board', { assignedTo, expected: previous })).status, 400);
  assert.equal((await details('board', { assignedTo: null, expected: previous }, 'fixture-project-tech', 'fixture-task-finance')).status, 404);
  await post('/api/projects/fixture-project-tech/tasks', { title: 'Synthetic inactive owner', assignedTo: 'fixture-revoked' }, 'synthetic-board-token', 400);
  const updated = { assignedTo: 'fixture-colleague', dueDate: '2026-10-12', priority: 'urgent' };
  assert.equal((await details('board', { ...updated, expected: previous })).status, 200);
  assert.ok(!(await queue()).tasks.some(t => t.id === 'fixture-task-tech'));
  const newOwnerTask = (await queue('synthetic-colleague-token')).tasks.find(t => t.id === 'fixture-task-tech');
  assert.equal(newOwnerTask.due_date, updated.dueDate); assert.equal(newOwnerTask.priority, updated.priority);
  const statusFor = (role, status) => fetch(`${base}/api/projects/fixture-project-tech/tasks/fixture-task-tech`, { method: 'PUT', headers: { Origin: 'https://personal.example', 'Content-Type': 'application/json', Authorization: `Bearer synthetic-${role}-token` }, body: JSON.stringify({ status }) });
  assert.equal((await statusFor('member', 'completed')).status, 403);
  assert.equal((await statusFor('colleague', 'completed')).status, 200);
  assert.equal((await statusFor('colleague', 'pending')).status, 200);
  const detailAudits = () => sql("SELECT actor_email, details FROM audit_log WHERE action = 'task_details_changed' AND target_id = 'fixture-task-tech'");
  assert.equal(detailAudits().length, 1);
  assert.equal(detailAudits()[0].actor_email, 'board@example.invalid');
  assert.deepEqual(JSON.parse(detailAudits()[0].details).from, previous);
  assert.deepEqual(JSON.parse(detailAudits()[0].details).to, updated);
  assert.equal((await details('board', { ...updated, expected: updated })).status, 200);
  assert.equal(detailAudits().length, 1, 'No-op retry creates no audit');
  assert.equal((await details('board', { ...previous, expected: previous })).status, 409, 'Stale editor cannot overwrite reassignment');
  assert.equal(detailAudits().length, 1);
  assert.equal((await details('board', { assignedTo: null, expected: updated })).status, 200);
  assert.ok(!(await queue('synthetic-colleague-token')).tasks.some(t => t.id === 'fixture-task-tech'));
  assert.equal((await details('board', { ...previous, expected: { ...updated, assignedTo: null } })).status, 200);
  const races = await Promise.all([
    details('board', { ...updated, expected: previous }),
    details('board', { assignedTo: null, dueDate: '2026-10-14', priority: 'high', expected: previous }),
  ]);
  assert.deepEqual(races.map(response => response.status).sort(), [200, 409], 'Competing owner edits cannot both overwrite one snapshot');
  const currentDetails = (await (await fileCall('/api/projects/fixture-project-tech/tasks', 'synthetic-board-token')).json()).data.find(t => t.id === 'fixture-task-tech');
  assert.equal(detailAudits().length, 4, 'Only the winning concurrent edit creates an audit');
  assert.equal((await details('board', { ...previous, expected: { assignedTo: currentDetails.assigned_to, dueDate: currentDetails.due_date, priority: currentDetails.priority } })).status, 200);
  const historyPath = '/api/projects/fixture-project-tech/tasks/fixture-task-tech/history';
  const historyResponse = await fileCall(historyPath, 'synthetic-member-token');
  assert.equal(historyResponse.status, 200); assert.equal(historyResponse.headers.get('cache-control'), 'private, no-store');
  const historyData = await historyResponse.json();
  assert.ok(historyData.data.some(event => event.action === 'task_details_changed' && event.actorName === 'Synthetic Board'));
  assert.ok(!JSON.stringify(historyData).includes('board@example.invalid'));
  assert.ok(!JSON.stringify(historyData).includes('actor_email'));
  assert.equal((await fileCall(historyPath, 'synthetic-director-token')).status, 404);
  assert.equal((await fileCall('/api/projects/fixture-project-finance/tasks/fixture-task-tech/history', 'synthetic-board-token')).status, 404);
  assert.equal((await fileCall(`${historyPath}?cursor=invalid`, 'synthetic-member-token')).status, 400);
  sql("INSERT INTO audit_log (id, action, actor_email, target_type, target_id, details) VALUES ('fixture-wrong-history', 'task_details_changed', 'board@example.invalid', 'project_task', 'fixture-task-tech', '{\"projectId\":\"fixture-project-finance\",\"privateContent\":\"hidden unrelated content\"}'), ('fixture-malformed-history', 'task_details_changed', 'board@example.invalid', 'project_task', 'fixture-task-tech', 'not json')");
  sql("INSERT INTO audit_log (id, action, actor_email, target_type, target_id, details, created_at) VALUES " + Array.from({ length: 55 }, (_, index) => `('fixture-history-${index}', 'task_status_changed', 'board@example.invalid', 'project_task', 'fixture-task-tech', '{"projectId":"fixture-project-tech","from":"pending","to":"completed"}', '2020-01-01 00:00:00')`).join(','));
  const firstHistoryPage = await (await fileCall(historyPath, 'synthetic-member-token')).json();
  assert.equal(firstHistoryPage.data.length, 50); assert.ok(firstHistoryPage.nextCursor);
  const secondHistoryPage = await (await fileCall(`${historyPath}?cursor=${encodeURIComponent(firstHistoryPage.nextCursor)}`, 'synthetic-member-token')).json();
  assert.equal(secondHistoryPage.nextCursor, null);
  const timeline = [...firstHistoryPage.data, ...secondHistoryPage.data];
  assert.equal(new Set(timeline.map(event => event.id)).size, timeline.length);
  assert.equal(timeline.filter(event => event.id.startsWith('fixture-history-')).length, 55);
  assert.deepEqual(timeline.filter(event => event.id.startsWith('fixture-history-')).map(event => event.id), Array.from({ length: 55 }, (_, index) => `fixture-history-${54 - index}`), 'Same-second history retains actual insertion order');
  assert.ok(!timeline.some(event => ['fixture-wrong-history', 'fixture-malformed-history'].includes(event.id)));
  console.log('Task history: current scope, task-project match, safe projection, malformed audit exclusion and stable paginated timeline verified');
  console.log('Task details: atomic owner/date/priority, active project access, immediate old/new owner permissions, stale-edit denial and attributable no-op-safe audit verified');
  let work = await queue();
  assert.deepEqual(work.tasks.map(task => task.id).sort(), ['fixture-task-explicit', 'fixture-task-tech']);
  assert.deepEqual(work.meetings.map(meeting => meeting.id).sort(), ['fixture-queue-club', 'fixture-queue-tech']);
  assert.equal(work.attention.incomingTransfers, 1);
  assert.equal(Object.hasOwn(work.attention, 'accountRequests'), false);
  const directorWork = await queue('synthetic-director-token');
  assert.deepEqual(directorWork.tasks.map(task => task.id), ['fixture-task-finance']);
  assert.deepEqual(directorWork.meetings.map(meeting => meeting.id).sort(), ['fixture-queue-club', 'fixture-queue-finance']);
  assert.equal(Object.hasOwn((await queue('synthetic-board-token')).attention, 'accountRequests'), true);
  assert.deepEqual((await queue('synthetic-advisory-token')).tasks.map(task => task.id), ['fixture-task-advisory']);
  sql("DELETE FROM project_roles WHERE id = 'fixture-advisory-project-role'");
  assert.equal((await queue('synthetic-advisory-token')).tasks.length, 0);
  sql("UPDATE users SET department_id = 'finance' WHERE id = 'fixture-member'");
  work = await queue();
  assert.deepEqual(work.tasks.map(task => task.id).sort(), ['fixture-task-explicit', 'fixture-task-hidden']);
  sql("UPDATE users SET department_id = 'tech' WHERE id = 'fixture-member'");
  const completed = await fetch(`${base}/api/projects/fixture-project-tech/tasks/fixture-task-tech`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'https://personal.example', Authorization: 'Bearer synthetic-member-token' },
    body: JSON.stringify({ status: 'completed' }),
  });
  assert.equal(completed.status, 200);
  assert.deepEqual((await queue()).tasks.map(task => task.id), ['fixture-task-explicit']);
  const creation = sql("SELECT id FROM project_tasks WHERE title = 'Synthetic scheduled creation'")[0];
  const creationEvents = (await (await fileCall(`/api/projects/fixture-project-tech/tasks/${creation.id}/history`, 'synthetic-board-token')).json()).data;
  assert.equal(creationEvents.filter(event => event.action === 'task_created').length, 1);
  assert.equal(creationEvents[0].to.status, 'pending'); assert.equal(creationEvents[0].to.priority, 'urgent');
  const completedBeforeBulk = sql("SELECT completed_at FROM project_tasks WHERE id = 'fixture-task-tech'")[0].completed_at;
  const pendingBeforeBulk = sql("SELECT COUNT(*) AS count FROM project_tasks WHERE project_id = 'fixture-project-tech' AND status = 'pending'")[0].count;
  const bulk = role => fetch(`${base}/api/projects/fixture-project-tech/tasks/complete-all`, { method: 'POST', headers: { Origin: 'https://personal.example', Authorization: `Bearer synthetic-${role}-token` } });
  assert.equal((await bulk('member')).status, 403);
  assert.equal((await bulk('board')).status, 200);
  const bulkAuditCount = () => sql("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'task_status_changed' AND json_valid(details) AND json_extract(details, '$.bulk') = 1 AND json_extract(details, '$.projectId') = 'fixture-project-tech'")[0].count;
  assert.equal(bulkAuditCount(), pendingBeforeBulk);
  assert.equal(sql("SELECT completed_at FROM project_tasks WHERE id = 'fixture-task-tech'")[0].completed_at, completedBeforeBulk);
  assert.equal((await bulk('board')).status, 200);
  assert.equal(bulkAuditCount(), pendingBeforeBulk, 'Bulk completion retry adds no false events');
  assert.equal(sql("SELECT COUNT(*) AS count FROM project_tasks WHERE project_id = 'fixture-project-tech' AND status = 'pending'")[0].count, 0);
  console.log('Task creation and bulk completion: transactional per-task history, permission denial and no-op timestamp/audit preservation verified');
  console.log('Local work queue: owned tasks, current project/department access, invitation scope, board approvals and relevant upcoming meetings verified');
  console.log('Local R2: shared categories, role restrictions, private namespace denial, exact ID lookup and private download headers verified');
  const memberJwt = jwt();
  await post('/api/auth/link-clerk', { clerkUserId: 'user_arbitrary' }, 'synthetic-member-token', 400);
  await post('/api/auth/link-clerk', { clerkToken: 'not-a-jwt' }, 'synthetic-member-token', 401);
  await post('/api/auth/clerk-login', { clerkToken: jwt('user_unlinked'), email: 'board@example.invalid' }, null, 403);
  assert.equal(sql("SELECT COUNT(*) AS count FROM users WHERE id = 'fixture-board' AND clerk_user_id IS NOT NULL")[0].count, 0, 'Caller email cannot auto-link a member');
  await post('/api/auth/link-clerk', { clerkToken: memberJwt, clerkUserId: 'user_forged_client_id' }, 'synthetic-member-token');
  assert.equal(sql("SELECT clerk_user_id FROM users WHERE id = 'fixture-member'")[0].clerk_user_id, 'user_synthetic_member');
  await post('/api/auth/link-clerk', { clerkToken: memberJwt }, 'synthetic-director-token', 409);
  const result = await post('/api/auth/clerk-login', { clerkToken: memberJwt, email: 'board@example.invalid' });
  assert.equal(result.email, 'member@example.invalid');
  assert.equal(result.token, 'synthetic-member-token');
  const device = await post('/api/auth/session', { token: result.token });
  assert.match(device.token, /^180dc_session_/);
  await post('/api/auth/clerk-login', { clerkToken: `${memberJwt.slice(0, -5)}AAAAA` }, null, 401);
  await post('/api/auth/clerk-login', { clerkToken: jwt(undefined, { azp: 'https://foreign.example' }) }, null, 401);
  await post('/api/auth/clerk-login', { clerkToken: jwt(undefined, { sts: 'pending' }) }, null, 401);
  await post('/api/auth/clerk-login', { clerkToken: jwt(undefined, { exp: 1 }) }, null, 401);
  sql("UPDATE admin_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE email = 'member@example.invalid'");
  await post('/api/auth/clerk-login', { clerkToken: memberJwt }, null, 403);
  assert.ok(sql("SELECT revoked_at FROM admin_tokens WHERE email = 'member@example.invalid'")[0].revoked_at, 'Google login cannot recreate revoked access');
  sql("UPDATE admin_tokens SET revoked_at = NULL, expires_at = '2000-01-01' WHERE email = 'member@example.invalid'");
  await post('/api/auth/clerk-login', { clerkToken: memberJwt }, null, 403);
  sql("UPDATE admin_tokens SET expires_at = NULL WHERE email = 'member@example.invalid'");
  sql("UPDATE users SET oauth_enabled = 0 WHERE id = 'fixture-member'");
  await post('/api/auth/clerk-login', { clerkToken: memberJwt }, null, 403);
  sql("UPDATE users SET oauth_enabled = 1 WHERE id = 'fixture-member'");
  sql("DELETE FROM admin_tokens WHERE email = 'member@example.invalid'");
  await post('/api/auth/clerk-login', { clerkToken: memberJwt }, null, 403);
  assert.equal(sql("SELECT COUNT(*) AS count FROM admin_tokens WHERE email = 'member@example.invalid'")[0].count, 0);
  sql("INSERT INTO admin_tokens (token, email, name, role_id) VALUES ('synthetic-member-token', 'member@example.invalid', 'Synthetic Member', 'member')");
  await post('/api/auth/link-clerk', { clerkToken: memberJwt }, 'synthetic-director-token', 409);
  await post('/api/auth/link-clerk', { clerkToken: memberJwt }, 'synthetic-director-token', 429);
  assert.equal(sql("SELECT count FROM rate_limits WHERE endpoint = 'link_clerk'")[0].count, 6);
  await stop(); await boot();
  await post('/api/auth/link-clerk', { clerkToken: memberJwt }, 'synthetic-director-token', 429);
  const attempts = await Promise.all(Array.from({ length: 20 }, () => fetch(`${base}/api/auth/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://personal.example', 'CF-Connecting-IP': '192.0.2.45' },
    body: JSON.stringify({ token: 'synthetic-invalid' }),
  })));
  assert.equal(attempts.filter(response => response.status === 401).length, 10);
  assert.equal(attempts.filter(response => response.status === 429).length, 10);
  assert.equal(sql("SELECT count FROM rate_limits WHERE endpoint = 'session_login' AND ip = '192.0.2.45'")[0].count, 11);
  await post('/api/auth/unlink-clerk', {}, 'synthetic-member-token');
  await post('/api/auth/clerk-login', { clerkToken: memberJwt }, null, 403);
  // Real D1 serializes the competing conditional link writes: exactly one account wins.
  const sharedJwt = jwt('user_synthetic_competing');
  const competing = await Promise.all(['synthetic-board-token', 'synthetic-director-token'].map(token => fetch(`${base}/api/auth/link-clerk`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://personal.example', 'CF-Connecting-IP': '192.0.2.44', Authorization: `Bearer ${token}` }, body: JSON.stringify({ clerkToken: sharedJwt }) })));
  assert.deepEqual(competing.map(response => response.status).sort(), [200, 409]);
  assert.equal(sql("SELECT COUNT(*) AS count FROM users WHERE clerk_user_id = 'user_synthetic_competing'")[0].count, 1);
  sql("UPDATE users SET clerk_user_id = 'user_synthetic_competing', oauth_enabled = 1 WHERE id IN ('fixture-board', 'fixture-director')");
  await post('/api/auth/clerk-login', { clerkToken: sharedJwt }, null, 403);
  assert.equal(sql("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'clerk_linked'")[0].count, 2);
  assert.equal(sql("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'clerk_unlinked'")[0].count, 1);
  console.log('Local production-mode Worker: real SDK RSA verification, explicit proof-backed links, conflicting/concurrent links, email impersonation denial, session exchange, revocation/expiry and unlink verified');
} finally {
  await stop();
  rmSync(entry, { force: true });
  rmSync(state, { recursive: true, force: true });
}
