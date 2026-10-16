import assert from 'node:assert/strict';
import { test } from 'node:test';
import { can, isPermission, resolvePermissions } from './permissions.ts';

test('global role grant allows every department', () => {
  const set = resolvePermissions([{ permission: 'people.edit', scope: 'global' }], [], 'tech');
  assert.equal(can(set, 'people.edit', 'finance'), true);
  assert.equal(can(set, 'people.edit'), true);
});

test('department-scoped role grant covers only own department', () => {
  const set = resolvePermissions([{ permission: 'people.edit', scope: 'department' }], [], 'tech');
  assert.equal(can(set, 'people.edit', 'tech'), true);
  assert.equal(can(set, 'people.edit', 'finance'), false);
  assert.equal(can(set, 'people.edit', null), false);
  assert.equal(can(set, 'people.edit'), true);
});

test('department-scoped role grant without a department grants nothing', () => {
  const set = resolvePermissions([{ permission: 'people.edit', scope: 'department' }], [], null);
  assert.equal(can(set, 'people.edit'), false);
});

test('personal grants add departments and global overrides', () => {
  const set = resolvePermissions(
    [{ permission: 'people.export', scope: 'department' }],
    [{ permission: 'people.export', departmentId: 'crm' }],
    'tech',
  );
  assert.equal(can(set, 'people.export', 'crm'), true);
  assert.equal(can(set, 'people.export', 'tech'), true);
  assert.equal(can(set, 'people.export', 'finance'), false);

  const global = resolvePermissions([], [{ permission: 'audit.view', departmentId: null }], null);
  assert.equal(can(global, 'audit.view', 'finance'), true);
});

test('unknown permission keys are ignored', () => {
  const set = resolvePermissions([{ permission: 'legacy.thing', scope: 'global' }], [], null);
  assert.equal(set.size, 0);
});

test('content, consulting, announcement and maintenance keys are in the catalogue', () => {
  for (const key of ['content.publish', 'content.manage', 'consulting.manage', 'announcements.manage', 'site.maintenance']) {
    assert.equal(isPermission(key), true, key);
  }
  const director = resolvePermissions(
    [
      { permission: 'content.publish', scope: 'global' },
      { permission: 'content.manage', scope: 'global' },
    ],
    [],
    'marketing',
  );
  assert.equal(can(director, 'content.manage'), true);
  assert.equal(can(director, 'consulting.manage'), false);
  assert.equal(can(director, 'site.maintenance'), false);
});
