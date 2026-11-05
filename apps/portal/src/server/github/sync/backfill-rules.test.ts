import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePhase, canAfford, dueRank, effectiveMode, isoAt, olderThan, orderDue, phasesFor, resyncDue, spend, startCursor, withAfter, withPage } from './backfill-rules.ts';

const NOW = Date.parse('2026-06-01T12:00:00Z');
const row = (over: Record<string, unknown>) => ({ id: 1, syncStatus: 'idle', lastSyncedAt: null, updatedAt: '2026-06-01 11:59:00', syncFailures: 0, ...over }) as Parameters<typeof orderDue>[0][number];

test('a full pass includes open issues, an incremental one does not', () => {
  assert.equal(phasesFor('full').includes('open_issues'), true);
  assert.equal(phasesFor('incremental').includes('open_issues'), false);
  assert.equal(phasesFor('incremental')[0], 'labels');
});

test('incremental needs a completed pass to start from', () => {
  assert.equal(effectiveMode({ syncMode: 'incremental', lastSyncedAt: null }), 'full');
  assert.equal(effectiveMode({ syncMode: 'incremental', lastSyncedAt: '2026-06-01T00:00:00Z' }), 'incremental');
  assert.equal(effectiveMode({ syncMode: 'full', lastSyncedAt: '2026-06-01T00:00:00Z' }), 'full');
});

test('start cursors look back 90 days when full, 5 minutes before the last pass when incremental', () => {
  const pass = '2026-06-01T12:00:00Z';
  assert.deepEqual(startCursor('full', pass, null), { phase: 'labels', page: 1, since: '2026-03-03T12:00:00Z', afterNumber: null });
  assert.equal(startCursor('incremental', pass, '2026-05-31T10:00:00Z').since, '2026-05-31T09:55:00Z');
});

test('phases advance in order and the pass ends after checks', () => {
  let cursor = startCursor('full', '2026-06-01T12:00:00Z', null) as ReturnType<typeof startCursor> | null;
  const seen: string[] = [];
  while (cursor) {
    seen.push(cursor.phase);
    cursor = advancePhase(withAfter(withPage(cursor, 3), 9), 'full');
  }
  assert.deepEqual(seen, ['labels', 'milestones', 'open_issues', 'recent_issues', 'pulls', 'reviews', 'checks']);
  const next = advancePhase({ phase: 'labels', page: 4, since: 's', afterNumber: 7 }, 'incremental');
  assert.deepEqual(next, { phase: 'milestones', page: 1, since: 's', afterNumber: null });
});

test('due repositories rank running, queued, backed-off failures, then stale idle ones', () => {
  assert.equal(dueRank(row({ syncStatus: 'running' }), NOW), 0);
  assert.equal(dueRank(row({ syncStatus: 'queued' }), NOW), 1);
  assert.equal(dueRank(row({ syncStatus: 'failed', syncFailures: 2, updatedAt: '2026-06-01 11:30:00' }), NOW), null);
  assert.equal(dueRank(row({ syncStatus: 'failed', syncFailures: 2, updatedAt: '2026-06-01 10:30:00' }), NOW), 2);
  assert.equal(dueRank(row({ lastSyncedAt: '2026-06-01T10:00:00Z' }), NOW), null);
  assert.equal(dueRank(row({ lastSyncedAt: '2026-06-01T05:00:00Z' }), NOW), 3);
  assert.equal(resyncDue(null, NOW), true);
});

test('ordering is by rank, then oldest sync, then id', () => {
  const ordered = orderDue(
    [
      row({ id: 5, lastSyncedAt: '2026-05-01T00:00:00Z' }),
      row({ id: 4, syncStatus: 'queued' }),
      row({ id: 3, lastSyncedAt: '2026-04-01T00:00:00Z' }),
      row({ id: 2, syncStatus: 'running' }),
      row({ id: 1, lastSyncedAt: '2026-06-01T11:00:00Z' }),
    ],
    NOW,
  );
  assert.deepEqual(ordered.map((r) => r.id), [2, 4, 3, 5]);
});

test('the budget never goes negative', () => {
  const budget = { remaining: 3 };
  assert.equal(canAfford(budget, 3), true);
  assert.equal(canAfford(budget, 4), false);
  spend(budget, 2);
  assert.equal(budget.remaining, 1);
  spend(budget, 5);
  assert.equal(budget.remaining, 0);
});

test('incremental pull scans stop at the first item older than the pass start', () => {
  assert.equal(olderThan('2026-05-31T00:00:00Z', '2026-06-01T00:00:00Z'), true);
  assert.equal(olderThan('2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z'), false);
  assert.equal(olderThan('2026-05-31T00:00:00Z', null), false);
  assert.equal(isoAt(Date.parse('2026-06-01T12:00:00.789Z')), '2026-06-01T12:00:00Z');
});
