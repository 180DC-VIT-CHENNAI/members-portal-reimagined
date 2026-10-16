import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasAccess, nextStatus } from './lifecycle.ts';

test('active members can go on leave, become alumni or be removed', () => {
  assert.deepEqual(nextStatus('active', 'on_leave', true), { ok: true, status: 'on_leave' });
  assert.deepEqual(nextStatus('active', 'alumni', true), { ok: true, status: 'alumni' });
  assert.deepEqual(nextStatus('active', 'removed', true), { ok: true, status: 'removed' });
});

test('invited people cannot be activated by hand', () => {
  assert.equal(nextStatus('invited', 'active', false).ok, false);
});

test('reinstating someone who never signed in returns them to invited', () => {
  assert.deepEqual(nextStatus('removed', 'active', false), { ok: true, status: 'invited' });
  assert.deepEqual(nextStatus('alumni', 'active', true), { ok: true, status: 'active' });
});

test('no-op and unknown transitions are rejected', () => {
  assert.equal(nextStatus('active', 'active', true).ok, false);
  assert.equal(nextStatus('alumni', 'on_leave', true).ok, false);
});

test('only active and on_leave keep access', () => {
  assert.equal(hasAccess('active'), true);
  assert.equal(hasAccess('on_leave'), true);
  assert.equal(hasAccess('invited'), false);
  assert.equal(hasAccess('alumni'), false);
  assert.equal(hasAccess('removed'), false);
});
