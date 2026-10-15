import assert from 'node:assert/strict';
const base = new URL(process.env.LOCAL_API_URL || 'http://127.0.0.1:8787');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Local Worker only');
async function call(path, role, options = {}) {
  return fetch(new URL(path, base), { ...options, headers: {
    Authorization: `Bearer synthetic-${role}-token`, Origin: 'https://personal.example',
    'Content-Type': 'application/json', ...options.headers,
  }, signal: AbortSignal.timeout(15000) });
}
async function projects(role) {
  const response = await call('/api/projects', role);
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
const expected = {
  board: ['fixture-project-tech', 'fixture-project-finance', 'fixture-project-explicit'],
  director: ['fixture-project-finance', 'fixture-project-explicit'],
  member: ['fixture-project-tech', 'fixture-project-explicit'],
  advisory: ['fixture-project-explicit'],
};
for (const [role, ids] of Object.entries(expected)) {
  const list = await projects(role);
  assert.deepEqual(list.filter(p => p.id.startsWith('fixture-project-')).map(p => p.id).sort(), [...ids].sort(), `${role} project visibility`);
  const dashboard = await call('/api/dashboard', role);
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).stats.projectsCount, list.filter(p => p.status !== 'completed').length, `${role} scoped dashboard count`);
  for (const id of Object.values(expected)[0]) {
    assert.equal((await call(`/api/projects/${id}/tasks`, role)).status, ids.includes(id) ? 200 : 404, `${role} direct ${id}`);
  }
  assert.equal((await call('/api/projects/nonexistent/tasks', role)).status, 404);
}
// Members can complete/reopen their assigned work, but not another member's.
async function update(project, task, role, status) {
  return call(`/api/projects/${project}/tasks/${task}`, role, { method: 'PUT', body: JSON.stringify({ status }) });
}
let tasks = (await (await call('/api/projects/fixture-project-tech/tasks', 'member')).json()).data;
assert.equal(tasks.find(t => t.id === 'fixture-task-tech').can_update, true);
assert.equal(tasks.find(t => t.id === 'fixture-task-other').can_update, false);
assert.equal((await update('fixture-project-tech', 'fixture-task-tech', 'member', 'completed')).status, 200);
tasks = (await (await call('/api/projects/fixture-project-tech/tasks', 'member')).json()).data;
const timestamp = tasks.find(t => t.id === 'fixture-task-tech').completed_at;
assert.ok(timestamp);
assert.equal((await update('fixture-project-tech', 'fixture-task-tech', 'member', 'completed')).status, 200);
tasks = (await (await call('/api/projects/fixture-project-tech/tasks', 'member')).json()).data;
assert.equal(tasks.find(t => t.id === 'fixture-task-tech').completed_at, timestamp, 'Retries preserve completion timestamp');
assert.equal((await update('fixture-project-tech', 'fixture-task-tech', 'member', 'pending')).status, 200);
tasks = (await (await call('/api/projects/fixture-project-tech/tasks', 'member')).json()).data;
assert.equal(tasks.find(t => t.id === 'fixture-task-tech').completed_at, null);
assert.equal((await update('fixture-project-tech', 'fixture-task-other', 'member', 'completed')).status, 403);
assert.equal((await update('fixture-project-finance', 'fixture-task-finance', 'member', 'completed')).status, 404);
assert.equal((await update('fixture-project-tech', 'nonexistent', 'board', 'completed')).status, 404);
assert.equal((await update('fixture-project-explicit', 'fixture-task-tech', 'board', 'completed')).status, 404, 'Task must belong to named project');
assert.equal((await update('fixture-project-tech', 'fixture-task-tech', 'member', 'invalid')).status, 400);
assert.equal((await call('/api/projects/fixture-project-tech/tasks/complete-all', 'member', { method: 'POST' })).status, 403);
assert.equal((await call('/api/projects/fixture-project-tech/tasks', 'board', {
  method: 'POST', body: JSON.stringify({ title: 'Synthetic denied assignment', assignedTo: 'fixture-director' }),
})).status, 400, 'A task cannot be assigned to someone outside its project');
assert.equal((await call('/api/projects/fixture-project-tech/tasks', 'board', {
  method: 'POST', body: JSON.stringify({ title: 'Synthetic unknown assignment', assignedTo: 'nonexistent' }),
})).status, 400);

// Removing the only explicit role must invalidate the next direct read and list.
const remove = await call('/api/projects/fixture-project-explicit/roles/fixture-advisory-project-role', 'board', { method: 'DELETE' });
assert.equal(remove.status, 200);
assert.equal((await call('/api/projects/fixture-project-explicit/tasks', 'advisory')).status, 404);
assert.equal((await projects('advisory')).some(p => p.id === 'fixture-project-explicit'), false);
console.log('Local Worker: scoped project list/count/direct reads, owned task completion/reopen/retry, denied unrelated writes and immediate role revocation verified');
