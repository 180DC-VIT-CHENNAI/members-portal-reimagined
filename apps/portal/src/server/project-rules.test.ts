import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PermissionSet } from './permissions.ts';
import { compareTasks, projectAccess, type TaskOrder } from './project-rules.ts';

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

test('tasks sort open first, then by due date, priority and age', () => {
  const task = (id: string, fields: Partial<TaskOrder>): TaskOrder => ({ id, status: 'pending', dueDate: null, priority: 'normal', createdAt: '2026-10-01 10:00:00', ...fields });
  const tasks = [
    task('done', { status: 'completed', dueDate: '2026-10-01' }),
    task('undated-urgent', { priority: 'urgent' }),
    task('late-low', { dueDate: '2026-10-20', priority: 'low' }),
    task('soon-normal', { dueDate: '2026-10-18' }),
    task('soon-high', { dueDate: '2026-10-18', priority: 'high' }),
    task('undated-old', { createdAt: '2026-09-01 10:00:00' }),
    task('undated-new', {}),
  ];
  assert.deepEqual(tasks.sort(compareTasks).map((t) => t.id), ['soon-high', 'soon-normal', 'late-low', 'undated-urgent', 'undated-old', 'undated-new', 'done']);
});
