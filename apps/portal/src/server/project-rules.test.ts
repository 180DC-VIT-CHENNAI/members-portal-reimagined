import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PermissionSet } from './permissions.ts';
import { compareTasks, projectAccess, projectViewScope, type TaskOrder } from './project-rules.ts';

const grants = (entries: Record<string, 'global' | string[]>): PermissionSet =>
  new Map(Object.entries(entries).map(([key, scope]) => [key, scope === 'global' ? 'global' : new Set(scope)])) as PermissionSet;

test('being named on a project only lets someone see it', () => {
  assert.deepEqual(projectAccess(grants({}), ['finance'], true), { view: true, manage: false, manageMembers: false, manageTasks: false });
  assert.equal(projectAccess(grants({}), ['finance'], false).view, false);
});

test('department grants cover a project through any of its departments', () => {
  const director = grants({ 'projects.view': ['finance'], 'projects.tasks.manage': ['finance'], 'projects.members.manage': ['finance'] });
  assert.deepEqual(projectAccess(director, ['marketing', 'finance'], false), { view: true, manage: false, manageMembers: true, manageTasks: true });
  assert.deepEqual(projectAccess(director, ['marketing'], false), { view: false, manage: false, manageMembers: false, manageTasks: false });
});

test('managing a project needs every one of its departments, or a global grant', () => {
  const scoped = grants({ 'projects.manage': ['finance'] });
  assert.equal(projectAccess(scoped, ['finance'], false).manage, true);
  assert.equal(projectAccess(scoped, ['finance', 'marketing'], false).manage, false);
  assert.equal(projectAccess(scoped, [], false).manage, false);
  assert.equal(projectAccess(grants({ 'projects.manage': 'global' }), ['finance', 'marketing'], false).manage, true);
});

test('department-project managers run internal projects wholly in their departments, and nothing else', () => {
  const lead = grants({ 'departments.projects.manage': ['finance'] });
  const all = { view: true, manage: true, manageMembers: true, manageTasks: true };
  const none = { view: false, manage: false, manageMembers: false, manageTasks: false };
  assert.deepEqual(projectAccess(lead, ['finance'], false, true), all);
  assert.deepEqual(projectAccess(lead, ['finance'], false), none);
  assert.deepEqual(projectAccess(lead, ['finance', 'marketing'], false, true), none);
  assert.deepEqual(projectAccess(grants({ 'departments.projects.manage': 'global' }), ['marketing'], false, true), all);
});

test('the view scope a query uses mirrors which grants reveal a project', () => {
  assert.deepEqual(projectViewScope(grants({})), { anyOf: [], allOf: [], clientAnyOf: [], internalAnyOf: [], internalAllOf: [] });
  assert.deepEqual(
    projectViewScope(grants({ 'projects.view': ['finance'], 'projects.tasks.manage': ['marketing', 'finance'], 'projects.manage': ['ops'], 'departments.projects.manage': ['hr'] })),
    { anyOf: ['finance', 'marketing'], allOf: ['ops'], clientAnyOf: ['finance'], internalAnyOf: [], internalAllOf: ['hr'] },
  );
  assert.equal(projectViewScope(grants({ 'projects.view': ['finance'], 'projects.members.manage': 'global' })).anyOf, 'global');
  assert.equal(projectViewScope(grants({ 'departments.projects.manage': 'global' })).internalAllOf, 'global');
  assert.deepEqual(projectViewScope(grants({ 'meets.view': 'global' })), { anyOf: [], allOf: [], clientAnyOf: [], internalAnyOf: [], internalAllOf: [] });
});

test('internal work preserves workspace privacy until a member is explicitly named', () => {
  const member = grants({ 'projects.view': ['finance'] });
  assert.equal(projectAccess(member, ['finance'], false).view, true);
  assert.equal(projectAccess(member, ['finance'], false, true).view, false);
  assert.equal(projectAccess(member, ['finance'], true, true).view, true);
  assert.equal(projectAccess(grants({ 'projects.view': 'global' }), ['finance'], false, true).view, false);
  assert.equal(projectAccess(grants({ 'departments.workspace.view': ['finance'] }), ['finance'], false, true).view, true);
  const scopes: Array<'global' | string[]> = ['global', ['finance']];
  for (const permission of ['projects.manage', 'projects.members.manage', 'projects.tasks.manage']) {
    for (const scope of scopes) {
      const clientOnly = grants({ [permission]: scope });
      assert.equal(projectAccess(clientOnly, ['finance'], false).view, true);
      assert.deepEqual(projectAccess(clientOnly, ['finance'], false, true), { view: false, manage: false, manageMembers: false, manageTasks: false });
      assert.equal(projectAccess(clientOnly, ['finance'], true, true).view, true);
    }
  }
});

test('tasks sort open first, then by due date, priority and age', () => {
  const task = (id: string, fields: Partial<TaskOrder>): TaskOrder => ({ id, status: 'pending', dueDate: null, priority: 'normal', createdAt: '2026-10-01 10:00:00', ...fields });
  const tasks = [
    task('done', { status: 'completed', dueDate: '2026-10-01' }),
    task('blocked', { status: 'blocked', dueDate: '2026-10-02' }),
    task('undated-urgent', { priority: 'urgent' }),
    task('late-low', { dueDate: '2026-10-20', priority: 'low' }),
    task('soon-normal', { dueDate: '2026-10-18' }),
    task('soon-high', { dueDate: '2026-10-18', priority: 'high' }),
    task('undated-old', { createdAt: '2026-09-01 10:00:00' }),
    task('undated-new', {}),
  ];
  assert.deepEqual(tasks.sort(compareTasks).map((t) => t.id), ['soon-high', 'soon-normal', 'late-low', 'undated-urgent', 'undated-old', 'undated-new', 'blocked', 'done']);
});
