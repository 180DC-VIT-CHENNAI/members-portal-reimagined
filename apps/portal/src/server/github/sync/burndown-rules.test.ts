import assert from 'node:assert/strict';
import test from 'node:test';
import { BURNDOWN_MAX_DAYS, type BurndownItem, computeBurndown } from './burndown-rules.ts';

const open = (created: string, extra: Partial<BurndownItem> = {}): BurndownItem => ({
  createdAt: `${created}T09:00:00Z`,
  state: 'open',
  closedAt: null,
  ...extra,
});
const closed = (created: string, closedOn: string, extra: Partial<BurndownItem> = {}): BurndownItem => ({
  createdAt: `${created}T09:00:00Z`,
  state: 'closed',
  closedAt: `${closedOn}T17:00:00Z`,
  ...extra,
});
const counts = (series: ReturnType<typeof computeBurndown>): Record<string, number> => Object.fromEntries(series.points.map((point) => [point.date, point.open]));

test('a milestone without items has no points', () => {
  assert.deepEqual(computeBurndown([], '2026-11-10', '2026-11-05'), { start: '2026-11-05', end: '2026-11-05', total: 0, points: [] });
});

test('without a due date it runs from the first item to today and has no ideal line', () => {
  const series = computeBurndown([open('2026-11-01'), closed('2026-11-02', '2026-11-04')], null, '2026-11-05');
  assert.equal(series.start, '2026-11-01');
  assert.equal(series.end, '2026-11-05');
  assert.equal(series.total, 2);
  assert.deepEqual(counts(series), { '2026-11-01': 1, '2026-11-02': 2, '2026-11-03': 2, '2026-11-04': 1, '2026-11-05': 1 });
  assert.ok(series.points.every((point) => point.ideal === null));
});

test('with a due date it starts 14 days before it, counts what closed before and after, and aims at 0 on the due date', () => {
  const series = computeBurndown(
    [open('2026-10-20'), closed('2026-10-25', '2026-11-02'), closed('2026-10-21', '2026-10-26'), open('2026-11-03')],
    '2026-11-10',
    '2026-11-05',
  );
  assert.equal(series.start, '2026-10-27');
  assert.equal(series.end, '2026-11-05');
  const byDate = Object.fromEntries(series.points.map((point) => [point.date, point]));
  assert.equal(byDate['2026-10-27']?.open, 2);
  assert.equal(byDate['2026-11-01']?.open, 2);
  assert.equal(byDate['2026-11-02']?.open, 1);
  assert.equal(byDate['2026-11-03']?.open, 2);
  assert.equal(byDate['2026-11-05']?.open, 2);
  assert.equal(byDate['2026-10-27']?.ideal, 2);
  assert.equal(byDate['2026-11-03']?.ideal, 1);
  assert.equal(byDate['2026-11-05']?.ideal, 0.71);
});

test('the start is the first item when that is later than 14 days before the due date', () => {
  const series = computeBurndown([open('2026-11-04')], '2026-11-10', '2026-11-05');
  assert.equal(series.start, '2026-11-04');
  assert.deepEqual(series.points.map((point) => point.ideal), [1, 0.83]);
});

test('past the due date the chart stops there and the ideal reaches 0', () => {
  const series = computeBurndown([open('2026-11-01')], '2026-11-04', '2026-11-20');
  assert.equal(series.end, '2026-11-04');
  assert.equal(series.points.at(-1)?.ideal, 0);
  assert.equal(series.points.at(-1)?.open, 1);
});

test('items created after the due date leave a single empty day at the due date', () => {
  const series = computeBurndown([open('2026-11-20')], '2026-11-10', '2026-11-25');
  assert.deepEqual(series.points, [{ date: '2026-11-10', open: 0, ideal: 0 }]);
});

test('a reopened item is open again from the reopen day when the activity log saw it', () => {
  const item = open('2026-11-01', {
    transitions: [
      { at: '2026-11-02T10:00:00Z', open: false },
      { at: '2026-11-04T10:00:00Z', open: true },
    ],
  });
  assert.deepEqual(counts(computeBurndown([item], null, '2026-11-05')), {
    '2026-11-01': 1,
    '2026-11-02': 0,
    '2026-11-03': 0,
    '2026-11-04': 1,
    '2026-11-05': 1,
  });
});

test('without activity a reopened item counts as open since creation, and a closed one as open until closed_at', () => {
  assert.deepEqual(Object.values(counts(computeBurndown([open('2026-11-01')], null, '2026-11-03'))), [1, 1, 1]);
  assert.deepEqual(Object.values(counts(computeBurndown([closed('2026-11-01', '2026-11-02')], null, '2026-11-03'))), [1, 0, 0]);
});

test('the stored state wins over the activity log', () => {
  const missedReopen = open('2026-11-01', { transitions: [{ at: '2026-11-02T10:00:00Z', open: false }] });
  assert.deepEqual(Object.values(counts(computeBurndown([missedReopen], null, '2026-11-03'))), [1, 1, 1]);
  const missedClose = closed('2026-11-01', '2026-11-03', { transitions: [{ at: '2026-11-02T10:00:00Z', open: true }] });
  assert.deepEqual(Object.values(counts(computeBurndown([missedClose], null, '2026-11-04'))), [1, 1, 0, 0]);
});

test('an item closed on the day it was created is never open at the end of a day', () => {
  assert.deepEqual(Object.values(counts(computeBurndown([closed('2026-11-01', '2026-11-01'), open('2026-11-01')], null, '2026-11-01'))), [1]);
});

test('a milestone without a due date is capped at one year of days', () => {
  const series = computeBurndown([open('2023-01-01')], null, '2026-11-05');
  assert.equal(series.points.length, BURNDOWN_MAX_DAYS);
  assert.equal(series.end, '2026-11-05');
  assert.equal(series.points[0]?.open, 1);
});
