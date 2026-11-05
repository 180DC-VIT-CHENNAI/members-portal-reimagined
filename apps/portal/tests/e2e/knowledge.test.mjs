import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

let portal, admin, finance, marketing, editor, director, editorId;
const article = (overrides = {}) => ({
  title: 'Handover process', slug: `handover-${crypto.randomUUID()}`, body: 'Sensitive finance methods',
  scope: 'department', departmentId: 'finance', status: 'published', tags: ['handover'], ...overrides,
});
before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, 'srijan.guchhait@gmail.com');
  for (const [email, departmentId, accessRoleId] of [
    ['kb.finance@example.com', 'finance', 'member'], ['kb.marketing@example.com', 'marketing', 'member'],
    ['kb.editor@example.com', 'finance', 'member'], ['kb.director@example.com', 'finance', 'director'],
  ]) {
    const made = await admin.post('/api/people', { email, fullName: email, departmentId, accessRoleId });
    assert.equal(made.status, 201, made.text);
    if (email === 'kb.editor@example.com') editorId = made.json.id;
  }
  finance = signIn(portal, 'kb.finance@example.com');
  marketing = signIn(portal, 'kb.marketing@example.com');
  editor = signIn(portal, 'kb.editor@example.com');
  director = signIn(portal, 'kb.director@example.com');
  const granted = await admin.put(`/api/people/${editorId}/access`, {
    accessRoleId: 'member', grants: [{ permission: 'knowledge.edit', departmentId: 'finance' }],
  });
  assert.equal(granted.status, 200, granted.text);
});
after(async () => { await portal?.stop(); });
beforeEach(() => portal.db.exec('DELETE FROM rate_limits'));

test('department knowledge is invisible outside its audience in list search and detail', async () => {
  // Given a finance article with a unique body search term.
  const input = article({ body: 'department-secret-needle' });
  const made = await admin.post('/api/knowledge', input);
  assert.equal(made.status, 201, made.text);
  // When readers from two departments search the same content.
  const own = await finance.get('/api/knowledge?search=department-secret-needle');
  const other = await marketing.get('/api/knowledge?search=department-secret-needle');
  // Then only the permitted department can discover or retrieve it.
  assert.deepEqual(own.json.articles.map((row) => row.id), [made.json.id]);
  assert.deepEqual(other.json.articles, []);
  assert.ok(!(await marketing.get('/api/knowledge')).json.articles.some((row) => row.id === made.json.id));
  assert.equal((await marketing.get(`/api/knowledge/${made.json.id}`)).status, 404);
  assert.equal((await finance.get(`/api/knowledge/${made.json.id}`)).status, 200);
});

test('drafts and archives are hidden from non-editors and revision history is restricted', async () => {
  // Given a draft in an otherwise readable department.
  const input = article({ status: 'draft', body: 'draft-secret-needle' });
  const made = await editor.post('/api/knowledge', input);
  assert.equal(made.status, 201, made.text);
  // When a normal reader asks for draft content and history.
  const results = await Promise.all([
    finance.get('/api/knowledge?search=draft-secret-needle'), finance.get(`/api/knowledge/${made.json.id}`),
    finance.get(`/api/knowledge/${made.json.id}/revisions`), editor.get(`/api/knowledge/${made.json.id}`),
  ]);
  // Then no draft body or search result reaches the reader.
  assert.deepEqual(results[0].json.articles, []);
  assert.deepEqual(results.slice(1).map((result) => result.status), [404, 404, 200]);
  const archived = await director.put(`/api/knowledge/${made.json.id}`, { ...input, status: 'archived', revision: 1 });
  assert.equal(archived.status, 200, archived.text);
  assert.equal((await finance.get(`/api/knowledge/${made.json.id}`)).status, 404);
});

test('edit and publish permissions are independent and revisions preserve prior text', async () => {
  // Given a department editor without publishing permission.
  const input = article({ status: 'draft', body: 'First revision' });
  const made = await editor.post('/api/knowledge', input);
  assert.equal(made.status, 201, made.text);
  assert.equal((await editor.put(`/api/knowledge/${made.json.id}`, { ...input, status: 'published', revision: 1 })).status, 403);
  // When a publisher saves a new published revision.
  const saved = await director.put(`/api/knowledge/${made.json.id}`, { ...input, body: 'Published revision', status: 'published', revision: 1 });
  assert.equal(saved.status, 200, saved.text);
  // Then readers see the published text while editors retain both revisions.
  assert.equal((await finance.get(`/api/knowledge/${made.json.id}`)).json.body, 'Published revision');
  const history = await director.get(`/api/knowledge/${made.json.id}/revisions`);
  assert.deepEqual(history.json.revisions.map((row) => row.snapshot.body), ['Published revision', 'First revision']);
  assert.equal((await finance.get(`/api/knowledge/${made.json.id}/revisions`)).status, 403);
  assert.equal((await director.put(`/api/knowledge/${made.json.id}`, { ...input, revision: 1 })).status, 409);
});

test('workspace grants allow cross-department reading without authorizing edits', async () => {
  // Given a finance article and an explicit workspace grant to a marketing member.
  const made = await admin.post('/api/knowledge', article({ body: 'cross-workspace-needle' }));
  const person = portal.db.prepare('SELECT id FROM people WHERE email = ?').get('kb.marketing@example.com');
  assert.equal((await admin.put(`/api/people/${person.id}/access`, {
    accessRoleId: 'member', grants: [{ permission: 'departments.workspace.view', departmentId: 'finance' }],
  })).status, 200);
  // When the member reads and tries to edit the newly visible article.
  const read = await marketing.get(`/api/knowledge/${made.json.id}`);
  const edit = await marketing.put(`/api/knowledge/${made.json.id}`, article({ revision: 1 }));
  // Then the workspace grant permits reading only.
  assert.equal(read.status, 200, read.text);
  assert.equal(edit.status, 403);
  await admin.put(`/api/people/${person.id}/access`, { accessRoleId: 'member', grants: [] });
});

test('raw HTML stays escaped in published articles and global articles reach all members', async () => {
  // Given hostile markup submitted to a club-wide article.
  const input = article({ scope: 'global', departmentId: null, body: '<img src=x onerror=alert(1)>\n# Safe heading' });
  const made = await admin.post('/api/knowledge', input);
  // When another department loads the article.
  const read = await marketing.get(`/api/knowledge/${made.json.id}`);
  // Then it is readable but the rendering contains no active HTML.
  assert.equal(read.status, 200, read.text);
  assert.match(read.json.renderedBody, /&lt;img/);
  assert.equal(read.json.renderedBody.includes('<img'), false);
  assert.equal((await anonymous(portal).get('/api/knowledge')).status, 401);
});

test('linked projects tasks and meetings are validated against current access', async () => {
  // Given a marketing project that a finance editor cannot see.
  const project = await admin.post('/api/projects', { name: 'Hidden linked project', departmentIds: ['marketing'] });
  const input = article({ status: 'draft', projectId: project.json.id });
  // When the finance editor tries to link it.
  const hidden = await editor.post('/api/knowledge', input);
  // Then the server refuses the hidden resource, and forged tasks/meetings too.
  assert.equal(hidden.status, 404, hidden.text);
  assert.equal((await editor.post('/api/knowledge', article({ status: 'draft', taskId: 'missing' }))).status, 404);
  assert.equal((await editor.post('/api/knowledge', article({ status: 'draft', meetId: 'missing' }))).status, 404);
});
