import assert from 'node:assert/strict';
import test from 'node:test';
import { burndownGeometry, yAxis } from './burndown-chart.ts';

const milestone = { id: 1, number: 1, title: 'Sprint 1', state: 'open', dueOn: '2026-11-10' } as const;

test('the y axis uses every integer up to 5 and four whole steps above', () => {
  assert.deepEqual(yAxis(0), { top: 1, ticks: [0, 1] });
  assert.deepEqual(yAxis(4), { top: 4, ticks: [0, 1, 2, 3, 4] });
  assert.deepEqual(yAxis(10), { top: 12, ticks: [0, 3, 6, 9, 12] });
});

test('the ideal line runs to 0 at a due date that is still ahead', () => {
  const chart = burndownGeometry({
    milestone,
    start: '2026-11-01',
    end: '2026-11-03',
    points: [
      { date: '2026-11-01', open: 4, ideal: 4 },
      { date: '2026-11-02', open: 3, ideal: 3.56 },
      { date: '2026-11-03', open: 3, ideal: 3.11 },
    ],
  });
  assert.equal(chart.actual.split(' L').length, 3);
  assert.ok(chart.actual.startsWith('M40 12'));
  assert.equal(chart.ideal, 'M40 12 L624 228');
  assert.ok(chart.last.x < chart.plot.right);
});

test('without a due date there is no ideal line and the axis ends at the last day', () => {
  const chart = burndownGeometry({
    milestone: { ...milestone, dueOn: null },
    start: '2026-11-01',
    end: '2026-11-03',
    points: [
      { date: '2026-11-01', open: 2, ideal: null },
      { date: '2026-11-03', open: 1, ideal: null },
    ],
  });
  assert.equal(chart.ideal, null);
  assert.equal(chart.last.x, chart.plot.right);
});

test('a single day is drawn in the middle', () => {
  const chart = burndownGeometry({ milestone, start: '2026-11-10', end: '2026-11-10', points: [{ date: '2026-11-10', open: 0, ideal: 0 }] });
  assert.equal(chart.last.x, (chart.plot.left + chart.plot.right) / 2);
  assert.equal(chart.xTicks.length, 1);
});
