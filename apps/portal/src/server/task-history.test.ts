import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyPersonIds, taskHistoryEvent } from './task-history.ts';

const row = (action: string, details: unknown, actorName: string | null = 'Dana') => ({ id: 1, action, createdAt: '2026-10-17 10:00:00', actorName, details });

test('only known task fields with valid values survive', () => {
  const event = taskHistoryEvent(
    row('task.update', {
      projectId: 'p',
      from: { title: 'Old', assigneeId: 'a', dueDate: '2026-10-01', priority: 'high', email: 'x@example.com' },
      to: { title: 'New', assigneeId: null, dueDate: '2026-10-01T00:00:00Z', priority: 'weird', description: 'private notes' },
    }),
    new Map([['a', 'Milo']]),
  );
  assert.deepEqual(event.from, { title: 'Old', assigneeId: 'a', assigneeName: 'Milo', dueDate: '2026-10-01', priority: 'high' });
  assert.deepEqual(event.to, { title: 'New', assigneeId: null, assigneeName: null, descriptionChanged: true });
  assert.ok(!JSON.stringify(event).includes('private notes') && !JSON.stringify(event).includes('example.com'));
});

test('status changes carry only the status; comment events expose nothing', () => {
  const status = taskHistoryEvent(row('task.status', { projectId: 'p', from: 'pending', to: 'completed', bulk: true }, null), new Map());
  assert.deepEqual([status.from, status.to, status.bulk, status.actorName], [{ status: 'pending' }, { status: 'completed' }, true, 'System']);
  const blocked = taskHistoryEvent(row('task.status', { projectId: 'p', from: 'pending', to: 'blocked', blockedReason: 'Waiting on client' }), new Map());
  assert.deepEqual([blocked.from, blocked.to], [{ status: 'pending' }, { status: 'blocked' }]);
  assert.ok(!JSON.stringify(blocked).includes('Waiting on client'));
  const comment = taskHistoryEvent(row('task.comment', { projectId: 'p', commentId: 9 }), new Map());
  assert.deepEqual([comment.from, comment.to, comment.bulk], [{}, {}, false]);
  assert.ok(!JSON.stringify(comment).includes('commentId'));
  assert.deepEqual(taskHistoryEvent(row('task.update', 'not an object'), new Map()).to, {});
});

test('the people an entry mentions are collected from both sides', () => {
  const ids = historyPersonIds([
    row('task.update', { from: { assigneeId: 'a' }, to: { assigneeId: 'b' } }),
    row('task.create', { to: { assigneeId: 'a' } }),
    row('task.status', { from: 'pending', to: 'completed' }),
  ]);
  assert.deepEqual(ids.sort(), ['a', 'b']);
});
