import assert from 'node:assert/strict';
import { test } from 'node:test';
import { campaignBudget, hourlyLimit } from './budget.ts';

test('campaign budget spreads the allowance across the remaining UTC minutes', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  assert.equal(campaignBudget(500, 0, now), 8);
  assert.equal(campaignBudget(500, 400, now), 1);
  assert.equal(campaignBudget(500, 450, now), 0);
  assert.equal(campaignBudget(500, 501, now), 0);
});

test('campaign budget never exceeds 15 near the end of an hour', () => {
  const now = new Date('2026-10-16T12:59:00Z');
  assert.equal(campaignBudget(500, 0, now), 15);
  assert.equal(campaignBudget(500, 449, now), 1);
  assert.equal(campaignBudget(500, 450, now), 0);
});

test('hourly limit defaults for unusable settings and floors positive overrides', () => {
  for (const value of [undefined, '', 'NaN', 'Infinity', '0', '-1', '0.5']) {
    assert.equal(hourlyLimit(value), 500);
  }
  assert.equal(hourlyLimit('1000.5'), 1000);
});
