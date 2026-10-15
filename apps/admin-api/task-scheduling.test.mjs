import test from 'node:test';
import assert from 'node:assert/strict';
import { taskSchedule } from './task-scheduling.ts';
test('task dates are calendar dates, never project deadlines or local timestamps', () => {
  assert.deepEqual(taskSchedule({}), { dueDate: null, priority: 'normal' });
  assert.deepEqual(taskSchedule({ dueDate: '2028-02-29', priority: 'urgent' }), { dueDate: '2028-02-29', priority: 'urgent' });
  for (const dueDate of ['2026-02-29', '2026-04-31', '2026-1-01', '2026-10-08T12:00:00Z', 123, {}, 'bad']) assert.throws(() => taskSchedule({ dueDate }));
  for (const priority of ['critical', null, 1, {}]) assert.throws(() => taskSchedule({ priority }));
});
