import assert from 'node:assert/strict';
import { test } from 'node:test';
import { departmentsByProject, reminderDates } from './notifications-rules.ts';

test('approaching means today and tomorrow as UTC dates, whatever the hour', () => {
  assert.deepEqual(reminderDates(new Date('2026-10-18T00:00:00Z')), ['2026-10-18', '2026-10-19']);
  assert.deepEqual(reminderDates(new Date('2026-10-18T23:59:59Z')), ['2026-10-18', '2026-10-19']);
  assert.deepEqual(reminderDates(new Date('2026-12-31T20:00:00-05:00')), ['2027-01-01', '2027-01-02']);
  assert.deepEqual(reminderDates(new Date('2028-02-28T12:00:00Z')), ['2028-02-28', '2028-02-29']);
});

test('department links are grouped by project in order', () => {
  const grouped = departmentsByProject([
    { projectId: 'p1', departmentId: 'finance' },
    { projectId: 'p2', departmentId: 'marketing' },
    { projectId: 'p2', departmentId: 'finance' },
  ]);
  assert.deepEqual([...grouped], [['p1', ['finance']], ['p2', ['marketing', 'finance']]]);
});
