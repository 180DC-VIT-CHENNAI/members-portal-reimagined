import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, decideRequest, diffAssignees, droppedFields, isOutcomeUnknown, labelChanges, labelRequestError, requestHash, stateChangeBody } from './write-rules.ts';

const NOW = Date.parse('2026-06-01T12:00:00Z');
const stored = (over: Record<string, unknown> = {}) => ({ requestHash: 'h', status: 'done', updatedAt: '2026-06-01 11:59:59', ...over }) as Parameters<typeof decideRequest>[0];

test('repeating a create request decides by hash and status', () => {
  assert.equal(decideRequest(null, 'h', NOW), 'insert');
  assert.equal(decideRequest(stored(), 'other', NOW), 'id_reused');
  assert.equal(decideRequest(stored(), 'h', NOW), 'replay');
  assert.equal(decideRequest(stored({ status: 'failed' }), 'h', NOW), 'retry');
  assert.equal(decideRequest(stored({ status: 'outcome_unknown' }), 'h', NOW), 'outcome_unknown');
  assert.equal(decideRequest(stored({ status: 'pending' }), 'h', NOW), 'in_progress');
  assert.equal(decideRequest(stored({ status: 'pending', updatedAt: '2026-06-01 11:50:00' }), 'h', NOW), 'outcome_unknown');
});

test('request hashes ignore key order and undefined fields', async () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: undefined }], c: 3 } }), '{"a":{"c":3,"d":[2,{"y":1}]},"b":1}');
  assert.equal(await requestHash({ a: 1, b: 2 }), await requestHash({ b: 2, a: 1, c: undefined }));
  assert.notEqual(await requestHash({ a: 1 }), await requestHash({ a: 2 }));
  assert.match(await requestHash({}), /^[0-9a-f]{64}$/);
});

test('only server-side and network failures leave the outcome unknown', () => {
  for (const kind of ['unavailable', 'network', 'timeout']) assert.equal(isOutcomeUnknown({ kind }), true, kind);
  for (const kind of ['forbidden', 'not_found', 'rate_limited']) assert.equal(isOutcomeUnknown({ kind }), false, kind);
  assert.equal(isOutcomeUnknown(new Error('x')), false);
});

test('assignee diffs add missing targets and remove only portal-managed assignees', () => {
  const user = (githubUserId: number, login: string) => ({ githubUserId, login });
  const diff = diffAssignees([user(1, 'ann'), user(2, 'bob'), user(3, 'outsider')], new Set([1, 2]), [user(1, 'ann'), user(4, 'cy')]);
  assert.deepEqual(diff, { add: ['cy'], remove: ['bob'] });
});

test('label requests reject status labels and unknown additions', () => {
  assert.equal(labelRequestError(['status: todo'], [], ['status: todo']), 'use_column_endpoint');
  assert.equal(labelRequestError([], ['WIP'], []), 'use_column_endpoint');
  assert.equal(labelRequestError(['nope'], [], ['bug']), 'unknown_label');
  assert.equal(labelRequestError(['bug'], ['old'], ['bug']), null);
});

test('label changes skip names already (or not) present', () => {
  assert.deepEqual(labelChanges(['a', 'b'], ['b', 'c', 'c'], ['a', 'z']), { add: ['c'], remove: ['a'] });
});

test('fields GitHub dropped from a user-token create are detected case-insensitively', () => {
  const dropped = droppedFields(
    { labels: ['Bug', 'docs'], assignees: ['Ann', 'bob'], milestoneNumber: 3 },
    { labels: ['bug'], assignees: ['ann'], milestoneNumber: null },
  );
  assert.deepEqual(dropped, { labels: ['docs'], assignees: ['bob'], milestone: true });
  assert.equal(droppedFields({ labels: [], assignees: [], milestoneNumber: null }, { labels: [], assignees: [], milestoneNumber: null }).milestone, false);
});

test('state changes carry the right reason', () => {
  assert.deepEqual(stateChangeBody('open', undefined), { state: 'open', state_reason: 'reopened' });
  assert.deepEqual(stateChangeBody('closed', undefined), { state: 'closed', state_reason: 'completed' });
  assert.deepEqual(stateChangeBody('closed', 'not_planned'), { state: 'closed', state_reason: 'not_planned' });
});
