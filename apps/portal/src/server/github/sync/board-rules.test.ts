import test from 'node:test';
import assert from 'node:assert/strict';
import { columnFor, compareInColumn, isMoveNoop, likePattern, normalizeLabel, planMove, statusOf, statusOfLabel } from './board-rules.ts';

test('labels normalise to lower-case words', () => {
  assert.equal(normalizeLabel('Status: In-Progress'), 'status in progress');
  assert.equal(normalizeLabel('  WIP!! '), 'wip');
});

test('status labels resolve to the furthest column', () => {
  assert.equal(statusOfLabel('Status: In-Progress'), 'in_progress');
  assert.equal(statusOfLabel('WIP'), 'in_progress');
  assert.equal(statusOfLabel('bug'), null);
  assert.equal(statusOf(['status: todo', 'Needs review', 'doing']), 'in_review');
  assert.equal(statusOf(['bug', 'docs']), null);
});

test('columns follow state, status label, draft and closing pulls', () => {
  const base = { kind: 'issue', state: 'open', draft: false, labelNames: [], openClosingPulls: 0 } as const;
  assert.equal(columnFor(base), 'backlog');
  assert.equal(columnFor({ ...base, state: 'closed', labelNames: ['status: todo'] }), 'done');
  assert.equal(columnFor({ ...base, labelNames: ['status: todo'] }), 'todo');
  assert.equal(columnFor({ ...base, openClosingPulls: 2 }), 'in_review');
  assert.equal(columnFor({ ...base, kind: 'pull', draft: true }), 'in_progress');
  assert.equal(columnFor({ ...base, kind: 'pull' }), 'in_review');
  assert.equal(columnFor({ ...base, kind: 'pull', labelNames: ['status: todo'] }), 'todo');
});

test('moving to a labelled column swaps status labels and creates the missing one', () => {
  const plan = planMove({ state: 'open', labelNames: ['bug', 'status: todo'] }, 'in_progress');
  assert.equal(plan.addLabel, 'status: in progress');
  assert.equal(plan.ensureLabel?.name, 'status: in progress');
  assert.deepEqual(plan.removeLabels, ['status: todo']);
  assert.equal(plan.state, null);
});

test('an alias of the target counts as already present', () => {
  const plan = planMove({ state: 'open', labelNames: ['WIP', 'status: todo'] }, 'in_progress');
  assert.equal(plan.addLabel, null);
  assert.equal(plan.ensureLabel, null);
  assert.deepEqual(plan.removeLabels, ['status: todo']);
});

test('moving to done closes, moving a closed item out of done reopens', () => {
  assert.deepEqual(planMove({ state: 'open', labelNames: [] }, 'done').state, { state: 'closed', stateReason: 'completed' });
  assert.equal(planMove({ state: 'closed', labelNames: [] }, 'done').state, null);
  assert.deepEqual(planMove({ state: 'closed', labelNames: [] }, 'todo').state, { state: 'open', stateReason: 'reopened' });
  const backlog = planMove({ state: 'open', labelNames: ['status: todo', 'bug'] }, 'backlog');
  assert.deepEqual(backlog.removeLabels, ['status: todo']);
  assert.equal(backlog.addLabel, null);
});

test('a move onto the current column is a no-op', () => {
  assert.equal(isMoveNoop(planMove({ state: 'open', labelNames: ['status: todo'] }, 'todo')), true);
  assert.equal(isMoveNoop(planMove({ state: 'open', labelNames: [] }, 'todo')), false);
});

test('cards sort by due date then recency; done by closing time', () => {
  const a = { effectiveDueDate: '2026-01-02', updatedAt: '2026-01-01', closedAt: null };
  const b = { effectiveDueDate: null, updatedAt: '2026-01-09', closedAt: null };
  const c = { effectiveDueDate: '2026-01-01', updatedAt: '2026-01-01', closedAt: null };
  assert.deepEqual([b, a, c].sort(compareInColumn('todo')), [c, a, b]);
  const early = { ...a, closedAt: '2026-01-01T00:00:00Z' };
  const late = { ...a, closedAt: '2026-02-01T00:00:00Z' };
  assert.deepEqual([early, late].sort(compareInColumn('done')), [late, early]);
});

test('LIKE patterns escape wildcards', () => {
  assert.equal(likePattern('50%_a\\b'), '%50\\%\\_a\\\\b%');
});
