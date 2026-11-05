import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HANDLED_WEBHOOK_EVENTS, IGNORE_REASONS } from '../types.ts';
import { checkGates, dispatch, failureDetail, gateIds, handlerFor, planDelivery, type GateFacts, type HandlerKey } from './dispatch.ts';

const org = { installation: { id: 7, account: { id: 1, login: '180DC-VIT-CHENNAI' } } };
const everything: GateFacts = { installationKnown: true, repositoryStored: true, repositoryMapped: true };

test('every row of the event table maps to its handler', () => {
  const table: Array<[string, string[], HandlerKey]> = [
    ['installation', ['created', 'new_permissions_accepted', 'unsuspend'], 'installation_upsert'],
    ['installation', ['suspend'], 'installation_suspend'],
    ['installation', ['deleted'], 'installation_delete'],
    ['installation_repositories', ['added'], 'installation_repos_added'],
    ['installation_repositories', ['removed'], 'installation_repos_removed'],
    ['github_app_authorization', ['revoked'], 'app_authorization_revoked'],
    ['repository', ['created', 'edited', 'renamed', 'transferred', 'archived', 'unarchived', 'publicized', 'privatized'], 'repository_upsert'],
    ['repository', ['deleted'], 'repository_removed'],
    ['label', ['created', 'edited'], 'label_upsert'],
    ['label', ['deleted'], 'label_delete'],
    ['milestone', ['created', 'edited', 'opened', 'closed'], 'milestone_upsert'],
    ['milestone', ['deleted'], 'milestone_delete'],
    [
      'issues',
      ['opened', 'edited', 'closed', 'reopened', 'assigned', 'unassigned', 'labeled', 'unlabeled', 'milestoned', 'demilestoned', 'locked', 'unlocked', 'pinned', 'unpinned', 'typed', 'untyped'],
      'issue_apply',
    ],
    ['issues', ['deleted', 'transferred'], 'issue_delete'],
    ['issue_comment', ['created', 'edited', 'deleted'], 'issue_comment_apply'],
    [
      'pull_request',
      [
        'opened', 'edited', 'closed', 'reopened', 'synchronize', 'ready_for_review', 'converted_to_draft', 'assigned', 'unassigned', 'labeled', 'unlabeled',
        'review_requested', 'review_request_removed', 'milestoned', 'demilestoned', 'locked', 'unlocked', 'auto_merge_enabled', 'auto_merge_disabled', 'enqueued', 'dequeued',
      ],
      'pull_apply',
    ],
    ['pull_request_review', ['submitted', 'edited', 'dismissed'], 'review_apply'],
    ['check_run', ['created', 'completed', 'rerequested', 'requested_action'], 'check_run_apply'],
  ];
  for (const [event, actions, handler] of table) {
    for (const action of actions) assert.equal(handlerFor(event, action), handler, `${event}.${action}`);
  }
  assert.equal(handlerFor('status', undefined), 'status_apply');
  assert.equal(handlerFor('status', 'anything'), 'status_apply');
});

test('actions outside the table and events outside the handled set are unhandled', () => {
  assert.deepEqual(planDelivery('star', { action: 'created' }), { ignore: 'unhandled_event' });
  assert.deepEqual(planDelivery('workflow_run', {}), { ignore: 'unhandled_event' });
  assert.deepEqual(planDelivery('issues', { ...org, action: 'transferred_to_space' }), { ignore: 'unhandled_event' });
  assert.deepEqual(planDelivery('issues', { ...org }), { ignore: 'unhandled_event' });
  assert.deepEqual(planDelivery('check_run', { ...org, action: 'unknown' }), { ignore: 'unhandled_event' });
  assert.deepEqual(planDelivery('installation', { ...org, action: 'new_permissions' }), { ignore: 'unhandled_event' });
});

test('ping is ignored as ping, before any other check', () => {
  assert.deepEqual(planDelivery('ping', { zen: 'Keep it logically awesome.' }), { ignore: 'ping' });
});

test('installation events from another account or without one are foreign', () => {
  const other = { action: 'created', installation: { id: 9, account: { id: 2, login: 'someone-else' } } };
  assert.deepEqual(planDelivery('installation', other), { ignore: 'foreign_installation' });
  assert.deepEqual(planDelivery('installation_repositories', { ...other, action: 'added' }), { ignore: 'foreign_installation' });
  assert.deepEqual(planDelivery('installation', { action: 'created', installation: { id: 9, account: null } }), { ignore: 'foreign_installation' });
  assert.deepEqual(planDelivery('installation', { action: 'created' }), { ignore: 'foreign_installation' });
});

test('the organisation matches without regard to case', () => {
  const lower = { action: 'created', installation: { id: 7, account: { login: '180dc-vit-chennai' } } };
  assert.deepEqual(planDelivery('installation', lower), {
    handler: 'installation_upsert',
    gates: { installation: false, repository: false, mapped: false },
  });
});

test('gates: installation events need nothing stored, repository events need the installation, scoped events need a mapped repository', () => {
  const gatesOf = (event: string, action: string) => {
    const plan = planDelivery(event, { ...org, action });
    assert.ok('gates' in plan, `${event}.${action}`);
    return plan.gates;
  };
  assert.deepEqual(gatesOf('installation_repositories', 'added'), { installation: false, repository: false, mapped: false });
  assert.deepEqual(gatesOf('github_app_authorization', 'revoked'), { installation: false, repository: false, mapped: false });
  assert.deepEqual(gatesOf('repository', 'renamed'), { installation: true, repository: false, mapped: false });
  for (const [event, action] of [['label', 'created'], ['milestone', 'created'], ['issues', 'opened'], ['issue_comment', 'created'], ['pull_request', 'opened'], ['pull_request_review', 'submitted'], ['check_run', 'completed'], ['status', 'x']]) {
    assert.deepEqual(gatesOf(event as string, action as string), { installation: true, repository: true, mapped: true }, event);
  }
});

test('gate facts give the ignore reason in order: installation, repository, mapping', () => {
  const gates = { installation: true, repository: true, mapped: true };
  assert.equal(checkGates(gates, everything), null);
  assert.equal(checkGates(gates, { installationKnown: false, repositoryStored: false, repositoryMapped: false }), 'unknown_installation');
  assert.equal(checkGates(gates, { installationKnown: true, repositoryStored: false, repositoryMapped: false }), 'unknown_repository');
  assert.equal(checkGates(gates, { installationKnown: true, repositoryStored: true, repositoryMapped: false }), 'unmapped_repository');
  assert.equal(checkGates({ installation: true, repository: false, mapped: false }, { installationKnown: true, repositoryStored: false, repositoryMapped: false }), null);
  assert.equal(checkGates({ installation: false, repository: false, mapped: false }, { installationKnown: false, repositoryStored: false, repositoryMapped: false }), null);
});

test('dispatch combines the plan and the facts', () => {
  const payload = { ...org, action: 'opened' };
  assert.deepEqual(dispatch('issues', payload, everything), { handler: 'issue_apply' });
  assert.deepEqual(dispatch('issues', payload, { ...everything, repositoryMapped: false }), { ignore: 'unmapped_repository' });
  assert.deepEqual(dispatch('issues', payload, { ...everything, repositoryStored: false, repositoryMapped: false }), { ignore: 'unknown_repository' });
  assert.deepEqual(dispatch('issues', payload, { ...everything, installationKnown: false }), { ignore: 'unknown_installation' });
  assert.deepEqual(dispatch('ping', {}, everything), { ignore: 'ping' });
});

test('every handled event except the three installation-level ones is reachable from some action', () => {
  const reachable = new Set<string>();
  for (const event of HANDLED_WEBHOOK_EVENTS) {
    for (const action of ['created', 'opened', 'added', 'revoked', 'submitted', 'completed', 'deleted']) {
      if (handlerFor(event, action)) reachable.add(event);
    }
  }
  assert.deepEqual([...reachable].sort(), HANDLED_WEBHOOK_EVENTS.filter((e) => e !== 'ping').sort());
});

test('every ignore reason in the contract is produced somewhere in the dispatcher', () => {
  const produced = new Set<string>([
    (planDelivery('star', {}) as { ignore: string }).ignore,
    (planDelivery('ping', {}) as { ignore: string }).ignore,
    (planDelivery('installation', { action: 'created' }) as { ignore: string }).ignore,
    checkGates({ installation: true, repository: true, mapped: true }, { installationKnown: false, repositoryStored: false, repositoryMapped: false }) as string,
    checkGates({ installation: true, repository: true, mapped: true }, { installationKnown: true, repositoryStored: false, repositoryMapped: false }) as string,
    checkGates({ installation: true, repository: true, mapped: true }, { installationKnown: true, repositoryStored: true, repositoryMapped: false }) as string,
  ]);
  const handlerProduced = IGNORE_REASONS.filter((reason) => reason !== 'stale');
  for (const reason of handlerProduced) assert.ok(produced.has(reason), reason);
});

test('gateIds reads numeric ids only', () => {
  assert.deepEqual(gateIds({ installation: { id: 7 }, repository: { id: 42 } }), { installationId: 7, repositoryId: 42 });
  assert.deepEqual(gateIds({ installation: { id: '7' }, repository: {} }), { installationId: null, repositoryId: null });
  assert.deepEqual(gateIds({}), { installationId: null, repositoryId: null });
  assert.deepEqual(gateIds({ installation: { id: 1.5 } }), { installationId: null, repositoryId: null });
});

test('failure detail names the error and is cut to 500 characters', () => {
  assert.equal(failureDetail(new TypeError('boom')), 'TypeError: boom');
  assert.equal(failureDetail('plain'), 'Error: plain');
  assert.equal(failureDetail(new Error('x'.repeat(900))).length, 500);
});
