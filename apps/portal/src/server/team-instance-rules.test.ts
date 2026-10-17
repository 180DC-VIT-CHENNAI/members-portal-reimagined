import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PermissionSet } from './permissions.ts';
import { canPlace, instanceAccess, ladder } from './team-instance-rules.ts';

const grants = (entries: Record<string, 'global' | string[]>): PermissionSet =>
  new Map(Object.entries(entries).map(([key, scope]) => [key, scope === 'global' ? 'global' : new Set(scope)])) as PermissionSet;

test('viewing grants no management, and no grant hides the instance', () => {
  assert.deepEqual(instanceAccess(grants({ 'team_instances.view': 'global' }), ['finance']), { view: true, staff: false, configure: false });
  assert.deepEqual(instanceAccess(grants({}), ['finance']), { view: false, staff: false, configure: false });
});

test('a department grant runs a joint instance but configures only one wholly its own', () => {
  const director = grants({ 'team_instances.manage': ['finance'] });
  assert.deepEqual(instanceAccess(director, ['finance', 'marketing']), { view: true, staff: true, configure: false });
  assert.deepEqual(instanceAccess(director, ['finance']), { view: true, staff: true, configure: true });
  assert.deepEqual(instanceAccess(director, ['marketing']), { view: false, staff: false, configure: false });
  assert.equal(instanceAccess(director, []).configure, false);
  assert.equal(instanceAccess(grants({ 'team_instances.manage': 'global' }), ['finance', 'marketing']).configure, true);
});

test('placing people follows the manager\'s department scope', () => {
  const director = grants({ 'team_instances.manage': ['finance'] });
  assert.equal(canPlace(director, 'finance'), true);
  assert.equal(canPlace(director, 'marketing'), false);
  assert.equal(canPlace(director, null), false);
  assert.equal(canPlace(grants({ 'team_instances.manage': 'global' }), null), true);
  assert.equal(canPlace(grants({ 'team_instances.view': 'global' }), 'finance'), false);
});

test('ladders number levels from one and name blank ones', () => {
  assert.deepEqual(ladder(['Round  1', '  ', 'Final']), [
    { position: 1, name: 'Round 1' },
    { position: 2, name: 'Level 2' },
    { position: 3, name: 'Final' },
  ]);
  assert.deepEqual(ladder([]), [{ position: 1, name: 'Level 1' }]);
});
