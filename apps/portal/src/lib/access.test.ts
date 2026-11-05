import assert from 'node:assert/strict';
import test from 'node:test';
import { type PermissionMap, visibleAdminTools } from './access.ts';

const paths = (perms: PermissionMap) => visibleAdminTools(perms).map((tool) => tool.path);

test('the GitHub admin tool needs a global github.manage grant, not a department-scoped one', () => {
  assert.ok(paths({ 'github.manage': 'global' }).includes('/admin/github'));
  assert.ok(!paths({ 'github.manage': ['dept_design'] }).includes('/admin/github'));
  assert.ok(!paths({}).includes('/admin/github'));
});
