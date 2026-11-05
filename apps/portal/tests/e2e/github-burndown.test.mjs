import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';

// The burndown and activity routes read rows the sync and webhook layers store; the rows are inserted directly,
// so no GitHub App, webhook or network is involved.
const ADMIN = 'srijan.guchhait@gmail.com';
const DAY_MS = 86_400_000;
let portal;
let admin;
let member;
let outsider;
let projectId;
let today;

const day = (offset) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
const at = (offset, time = '12:00:00') => `${day(offset)}T${time}Z`;

function seedIssue(db, { id, repository = 100, number, kind = 'issue', state = 'open', milestone = null, created, closed = null }) {
  db.prepare(
    `INSERT INTO github_issues (id, repository_id, number, kind, title, state, html_url, milestone_id, github_created_at, github_updated_at, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, repository, number, kind, `Item ${number}`, state, `https://github.com/180DC-VIT-CHENNAI/site/issues/${number}`, milestone, created, closed ?? created, closed);
}

let deliveries = 0;
function seedActivity(db, { issue, kind, actor = 'octocat', occurredAt }) {
  deliveries += 1;
  db.prepare(
    `INSERT INTO github_activity (delivery_id, repository_id, issue_id, kind, actor_github_id, actor_login, detail, occurred_at)
     VALUES (?, 100, ?, ?, 7, ?, '{}', ?)`,
  ).run(`delivery-${deliveries}`, issue, kind, actor, occurredAt);
}

before(async () => {
  portal = await startPortal();
  today = new Date().toISOString().slice(0, 10);
  admin = signIn(portal, ADMIN);
  for (const [email, departmentId] of [['bd.finance@example.com', 'finance'], ['bd.marketing@example.com', 'marketing']]) {
    const invited = await admin.post('/api/people', { email, fullName: email.split('@')[0], departmentId });
    assert.equal(invited.status, 201, invited.text);
  }
  member = signIn(portal, 'bd.finance@example.com');
  outsider = signIn(portal, 'bd.marketing@example.com');
  const created = await admin.post('/api/projects', { name: 'Burndown project', departmentIds: ['finance'] });
  assert.equal(created.status, 201, created.text);
  projectId = created.json.id;

  const { db } = portal;
  db.prepare("INSERT INTO github_installations (id, account_id, account_login, account_type, repository_selection) VALUES (1, 1, '180DC-VIT-CHENNAI', 'Organization', 'all')").run();
  const repository = db.prepare("INSERT INTO github_repositories (id, installation_id, owner_login, name, full_name, project_id) VALUES (?, 1, '180DC-VIT-CHENNAI', ?, ?, ?)");
  repository.run(100, 'site', '180DC-VIT-CHENNAI/site', projectId);
  repository.run(200, 'unmapped', '180DC-VIT-CHENNAI/unmapped', null);
  const milestone = db.prepare('INSERT INTO github_milestones (id, repository_id, number, title, state, due_on, github_created_at, github_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  milestone.run(10, 100, 1, 'Sprint 1', 'open', day(5), at(-9), at(-1));
  milestone.run(11, 100, 2, 'Empty sprint', 'open', null, at(-9), at(-1));
  milestone.run(20, 200, 1, 'Elsewhere', 'open', null, at(-9), at(-1));

  seedIssue(db, { id: '100-1', number: 1, milestone: 10, created: at(-9) });
  seedIssue(db, { id: '100-2', number: 2, state: 'closed', milestone: 10, created: at(-8), closed: at(-2) });
  seedIssue(db, { id: '100-3', number: 3, milestone: 10, created: at(-3) });
  seedIssue(db, { id: '100-4', number: 4, kind: 'pull', milestone: 10, created: at(-1) });
  seedIssue(db, { id: '100-5', number: 5, created: at(-9) });
  seedActivity(db, { issue: '100-3', kind: 'closed', occurredAt: at(-1, '08:00:00') });
  seedActivity(db, { issue: '100-3', kind: 'reopened', occurredAt: at(0, '08:00:00') });
});
after(async () => {
  await portal?.stop();
});

test('the burndown counts open items per day, handles a reopen, and aims at 0 on the due date', async () => {
  const res = await member.get(`/api/github/projects/${projectId}/burndown?milestone=10`);
  assert.equal(res.status, 200, res.text);
  assert.match(res.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(res.json.repositoryId, 100);
  assert.equal(res.json.milestone.title, 'Sprint 1');
  assert.equal(res.json.start, day(-9));
  assert.equal(res.json.end, today);
  assert.equal(res.json.total, 4);
  const open = res.json.points.map((point) => point.open);
  assert.deepEqual(open, [1, 2, 2, 2, 2, 2, 3, 2, 2, 3]);
  assert.deepEqual(
    res.json.points.map((point) => point.date),
    Array.from({ length: 10 }, (_, index) => day(index - 9)),
  );
  assert.equal(res.json.points[0].ideal, 1);
  assert.equal(res.json.points[7].ideal, 0.5);
  assert.equal(res.json.points[9].ideal, 0.36);
});

test('a milestone without items has no points and one without a due date has no ideal line', async () => {
  const res = await admin.get(`/api/github/projects/${projectId}/burndown?milestone=11`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.total, 0);
  assert.deepEqual(res.json.points, []);
});

test('the burndown follows project access and rejects other projects\' milestones', async () => {
  const path = `/api/github/projects/${projectId}/burndown?milestone=10`;
  assert.equal((await anonymous(portal).get(path)).status, 401);
  assert.equal((await outsider.get(path)).status, 404);
  const foreign = await admin.get(`/api/github/projects/${projectId}/burndown?milestone=20`);
  assert.equal(foreign.status, 404, foreign.text);
  assert.equal((await admin.get(`/api/github/projects/${projectId}/burndown?milestone=999`)).status, 404);
  assert.equal((await admin.get(`/api/github/projects/${projectId}/burndown`)).status, 400);
  assert.equal((await admin.get(`/api/github/projects/${projectId}/burndown?milestone=abc`)).status, 400);
});

test('the activity feed lists the latest 50 events newest first with actor, action, item and time', async () => {
  for (let index = 0; index < 55; index += 1) {
    seedActivity(portal.db, { issue: '100-1', kind: index % 2 ? 'closed' : 'reopened', actor: `actor-${index}`, occurredAt: at(-9 + (index % 9), `${String(index % 24).padStart(2, '0')}:00:00`) });
  }
  const res = await member.get(`/api/github/projects/${projectId}/activity`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.activity.length, 50);
  const ids = res.json.activity.map((row) => row.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
  assert.equal(res.json.activity[0].actor.login, 'actor-54');
  assert.equal(res.json.activity[0].kind, 'reopened');
  assert.equal(res.json.activity[0].issueId, '100-1');
  assert.ok(res.json.activity[0].occurredAt);
  assert.equal(res.json.nextBefore, ids[49]);

  const older = await member.get(`/api/github/projects/${projectId}/activity?before=${res.json.nextBefore}`);
  assert.equal(older.status, 200, older.text);
  assert.equal(older.json.activity.length, 7);
  assert.equal(older.json.nextBefore, null);
});

test('the activity feed follows project access', async () => {
  const path = `/api/github/projects/${projectId}/activity`;
  assert.equal((await anonymous(portal).get(path)).status, 401);
  assert.equal((await outsider.get(path)).status, 404);
});
