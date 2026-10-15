import test from 'node:test';
import assert from 'node:assert/strict';
import { taskHistoryEvent } from './task-history.ts';
test('task history exposes only task fields, without raw audit details or email', () => {
  const event = taskHistoryEvent({ id: 'event', action: 'task_details_changed', created_at: '2026-10-08 00:00:00', actor_name: null, actor_email: 'private@example.invalid', details: JSON.stringify({ privateContent: 'hidden', from: { assignedTo: null, dueDate: null, priority: 'normal', secret: 'hidden' }, to: { assignedTo: 'member', dueDate: '2026-10-12', priority: 'urgent' } }) });
  assert.equal(event.actorName, 'Former member');
  assert.deepEqual(event.from, { assignedTo: null, dueDate: null, priority: 'normal' });
  assert.ok(!JSON.stringify(event).includes('hidden'));
  assert.ok(!JSON.stringify(event).includes('private@example.invalid'));
  assert.deepEqual(taskHistoryEvent({ id: 'bad', action: 'task_details_changed', created_at: '', actor_name: null, details: 'null' }).from, {});
});
