import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedAcknowledgments, buildChecklist, profileGaps } from './onboarding.ts';
import type { Permission, PermissionSet } from './permissions.ts';

const blank = { id: 'p1', departmentId: 'tech', year: null, branch: null, bio: null, skills: [] };
const member: PermissionSet = new Map<Permission, 'global' | Set<string>>([
  ['departments.workspace.view', new Set(['tech'])],
  ['files.view', 'global'],
]);

test('profile completeness needs public fields only', () => {
  assert.deepEqual(profileGaps(blank), ['year', 'branch', 'about']);
  assert.deepEqual(profileGaps({ ...blank, year: 2, branch: 'CSE', skills: ['excel'] }), []);
  assert.deepEqual(profileGaps({ ...blank, year: 2, branch: '  ', bio: 'Hi' }), ['branch']);
});

test('read items appear only where the person has access', () => {
  assert.deepEqual(buildChecklist(blank, member, new Map()).items.map((i) => i.key), ['profile', 'department', 'resources']);
  assert.deepEqual(buildChecklist({ ...blank, departmentId: null }, new Map(), new Map()).items.map((i) => i.key), ['profile']);
  assert.deepEqual(buildChecklist({ ...blank, departmentId: 'finance' }, member, new Map()).items.map((i) => i.key), ['profile', 'resources']);
});

test('read items finish only with an acknowledgment; the profile only from data', () => {
  const acks = new Map([['department_read', '2026-10-18 10:00:00'], ['resources_read', '2026-10-18 10:01:00']] as const);
  const open = buildChecklist(blank, member, acks);
  assert.equal(open.items.find((i) => i.key === 'department')?.doneAt, '2026-10-18 10:00:00');
  assert.equal(open.complete, false);
  assert.equal(open.visible, true);
  const done = buildChecklist({ ...blank, year: 1, branch: 'ECE', bio: 'Hello' }, member, acks);
  assert.deepEqual([done.complete, done.visible], [true, false]);
});

test('hiding the checklist keeps items truthful but stops showing it', () => {
  const hidden = buildChecklist(blank, member, new Map([['checklist_dismissed', 'now']]));
  assert.deepEqual([hidden.complete, hidden.dismissed, hidden.visible], [false, true, false]);
});

test('only shown read items and hiding can be acknowledged', () => {
  assert.deepEqual([...allowedAcknowledgments(buildChecklist({ ...blank, departmentId: null }, new Map(), new Map()))], ['checklist_dismissed']);
  assert.deepEqual([...allowedAcknowledgments(buildChecklist(blank, member, new Map()))].sort(), ['checklist_dismissed', 'department_read', 'resources_read']);
});
