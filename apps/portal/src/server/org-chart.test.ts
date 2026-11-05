import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createsCycle } from './org-chart.ts';

const edges = [
  { personId: 'member', reportsTo: 'director' },
  { personId: 'director', reportsTo: 'chair' },
  { personId: 'chair', reportsTo: null },
];

test('reporting up an existing chain is allowed', () => {
  assert.equal(createsCycle(edges, 'newcomer', 'member'), false);
  assert.equal(createsCycle(edges, 'member', 'chair'), false);
});

test('reporting to yourself or to someone below you is a cycle', () => {
  assert.equal(createsCycle(edges, 'chair', 'chair'), true);
  assert.equal(createsCycle(edges, 'chair', 'member'), true);
});

test('an existing loop elsewhere does not hang the check', () => {
  const looped = [{ personId: 'a', reportsTo: 'b' }, { personId: 'b', reportsTo: 'a' }];
  assert.equal(createsCycle(looped, 'c', 'a'), false);
});

test('every reporting line is checked when someone has multiple tenures', () => {
  const multiple = [...edges, { personId: 'director', reportsTo: 'another-chair' }];
  assert.equal(createsCycle(multiple, 'chair', 'member'), true);
});
