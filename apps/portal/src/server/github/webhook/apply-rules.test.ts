import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GhCheckRun, GhIssue, GhPullRequest, GhReview, GhUser, StoredReview } from '../types.ts';
import {
  activityOf,
  appliesOver,
  checkAggregate,
  checkRunValues,
  closingReferences,
  commitStatusValues,
  dueOnDate,
  issueValues,
  mentions,
  mergedFromIssue,
  mergeReview,
  noticeTargets,
  pullCommonValues,
  pullValues,
  reviewDecision,
  storedReviewOf,
  usersOf,
} from './apply-rules.ts';

const ana: GhUser = { id: 11, login: 'ana' };
const raj: GhUser = { id: 22, login: 'Raj' };
const bot: GhUser = { id: 33, login: 'sender-bot' };

const issue = (over: Partial<GhIssue> = {}): GhIssue => ({
  id: 9001,
  number: 12,
  title: 'Fix login',
  body: 'It breaks',
  state: 'open',
  html_url: 'https://github.com/180DC-VIT-CHENNAI/site/issues/12',
  user: ana,
  assignees: [raj],
  labels: [{ id: 5, name: 'bug', color: 'd73a4a', description: null }],
  milestone: null,
  comments: 3,
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-02T10:00:00Z',
  closed_at: null,
  ...over,
});

const pull = (over: Partial<GhPullRequest> = {}): GhPullRequest => ({
  id: 9100,
  number: 20,
  title: 'Add login',
  body: 'Fixes #12',
  state: 'open',
  html_url: 'https://github.com/180DC-VIT-CHENNAI/site/pull/20',
  user: ana,
  assignees: [],
  requested_reviewers: [raj],
  labels: [],
  milestone: null,
  draft: true,
  merged: false,
  merged_at: null,
  head: { ref: 'login', sha: 'abc123' },
  base: { ref: 'main', repo: { id: 77 } },
  comments: 0,
  created_at: '2026-11-01T11:00:00Z',
  updated_at: '2026-11-02T11:00:00Z',
  closed_at: null,
  ...over,
});

const review = (user: GhUser, state: string, at: string | null): StoredReview => ({
  githubUserId: user.id,
  login: user.login,
  state: state as StoredReview['state'],
  submittedAt: at,
});

test('an issue becomes common item values keyed by repository and number', () => {
  const values = issueValues(77, issue());
  assert.equal(values.id, '77-12');
  assert.equal(values.kind, 'issue');
  assert.equal(values.authorGithubId, 11);
  assert.equal(values.commentCount, 3);
  assert.deepEqual(values.assignees, [raj]);
  assert.equal(issueValues(77, issue({ user: null })).authorLogin, null);
  assert.equal(issueValues(77, issue({ pull_request: {} })).kind, 'pull');
});

test('the issue representation sets a merge time but never clears one', () => {
  assert.deepEqual(mergedFromIssue(issue({ pull_request: { merged_at: '2026-11-03T00:00:00Z' } })), { merged: true, mergedAt: '2026-11-03T00:00:00Z' });
  assert.equal(mergedFromIssue(issue({ pull_request: { merged_at: null } })), null);
  assert.equal(mergedFromIssue(issue({ pull_request: {} })), null);
  assert.equal(mergedFromIssue(issue()), null);
});

test('a pull request gives common values and pull-only values', () => {
  const common = pullCommonValues(77, pull());
  assert.equal(common.id, '77-20');
  assert.equal(common.kind, 'pull');
  assert.equal(common.stateReason, null);
  assert.equal(pullCommonValues(77, pull({ comments: undefined })).commentCount, null);
  const values = pullValues(pull());
  assert.deepEqual(
    { ...values, requestedReviewers: values.requestedReviewers.map((u) => u.login) },
    { draft: true, merged: false, mergedAt: null, headRef: 'login', headSha: 'abc123', baseRef: 'main', pullUpdatedAt: '2026-11-02T11:00:00Z', requestedReviewers: ['Raj'] },
  );
  assert.equal(pullValues(pull({ merged: undefined, merged_at: '2026-11-03T00:00:00Z' })).merged, true);
  assert.equal(pullValues(pull({ draft: undefined })).draft, false);
});

test('a representation applies when it is not older than the stored one', () => {
  assert.equal(appliesOver('2026-11-02T10:00:00Z', null), true);
  assert.equal(appliesOver('2026-11-02T10:00:00Z', undefined), true);
  assert.equal(appliesOver('2026-11-02T10:00:00Z', '2026-11-02T10:00:00Z'), true);
  assert.equal(appliesOver('2026-11-02T10:00:01Z', '2026-11-02T10:00:00Z'), true);
  assert.equal(appliesOver('2026-11-02T09:59:59Z', '2026-11-02T10:00:00Z'), false);
});

test('a milestone due date keeps only its date', () => {
  assert.equal(dueOnDate('2026-12-01T00:00:00Z'), '2026-12-01');
  assert.equal(dueOnDate(null), null);
});

test('review states are lower-cased and pending reviews are dropped', () => {
  const base: GhReview = { id: 1, user: ana, state: 'APPROVED', submitted_at: '2026-11-02T12:00:00Z' };
  assert.deepEqual(storedReviewOf(base), { githubUserId: 11, login: 'ana', state: 'approved', submittedAt: '2026-11-02T12:00:00Z' });
  assert.equal(storedReviewOf({ ...base, state: 'changes_requested' })?.state, 'changes_requested');
  assert.equal(storedReviewOf({ ...base, state: 'PENDING' }), null);
  assert.equal(storedReviewOf({ ...base, user: null }), null);
  assert.equal(storedReviewOf({ ...base, submitted_at: undefined })?.submittedAt, null);
});

test('the latest review per reviewer wins, a comment never replaces a verdict, an older review is ignored', () => {
  const approved = review(ana, 'approved', '2026-11-02T12:00:00Z');
  assert.deepEqual(mergeReview([], approved), [approved]);
  const changes = review(ana, 'changes_requested', '2026-11-02T13:00:00Z');
  assert.deepEqual(mergeReview([approved], changes), [changes]);
  assert.deepEqual(mergeReview([changes], review(ana, 'commented', '2026-11-02T14:00:00Z')), [changes]);
  assert.deepEqual(mergeReview([review(ana, 'commented', '2026-11-02T10:00:00Z')], approved), [approved]);
  assert.deepEqual(mergeReview([changes], approved), [changes]);
  assert.deepEqual(mergeReview([approved], review(raj, 'commented', null)).map((r) => r.login), ['ana', 'Raj']);
  const dismissed = review(ana, 'dismissed', '2026-11-02T15:00:00Z');
  assert.deepEqual(mergeReview([approved], dismissed), [dismissed]);
});

test('the review decision follows the verdicts, then requested reviewers', () => {
  const approved = review(ana, 'approved', null);
  const changes = review(raj, 'changes_requested', null);
  assert.equal(reviewDecision([approved, changes], 0), 'changes_requested');
  assert.equal(reviewDecision([approved], 2), 'approved');
  assert.equal(reviewDecision([review(ana, 'commented', null)], 1), 'review_required');
  assert.equal(reviewDecision([], 1), 'review_required');
  assert.equal(reviewDecision([], 0), 'none');
  assert.equal(reviewDecision([review(ana, 'dismissed', null)].filter((r) => r.state !== 'dismissed'), 0), 'none');
});

test('the check aggregate is failure, then pending, then success, then none', () => {
  const done = (conclusion: string | null) => ({ state: 'completed' as const, conclusion });
  const pending = { state: 'pending' as const, conclusion: null };
  assert.equal(checkAggregate([]), 'none');
  assert.equal(checkAggregate([done('success'), done('neutral'), done('skipped')]), 'success');
  assert.equal(checkAggregate([done('success'), pending]), 'pending');
  assert.equal(checkAggregate([done('failure'), pending]), 'failure');
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required', 'stale', 'startup_failure', null]) {
    assert.equal(checkAggregate([done(conclusion)]), 'failure', String(conclusion));
  }
});

test('check runs and commit statuses become keyed rows', () => {
  const run: GhCheckRun = { id: 500, name: 'ci', head_sha: 'abc', status: 'completed', conclusion: 'success', details_url: 'https://ci/1', app: { id: 8 } };
  assert.deepEqual(checkRunValues(run), {
    sha: 'abc', source: 'check_run', checkKey: '8:ci', name: 'ci', externalId: 500, state: 'completed', conclusion: 'success', detailsUrl: 'https://ci/1',
  });
  const queued = checkRunValues({ ...run, status: 'queued', conclusion: null, app: null, details_url: null, html_url: 'https://ci/h' });
  assert.deepEqual([queued.state, queued.conclusion, queued.checkKey, queued.detailsUrl], ['pending', null, '0:ci', 'https://ci/h']);
  assert.equal(checkRunValues({ ...run, status: 'in_progress', conclusion: 'success' }).conclusion, null);

  const status = { id: 7, sha: 'abc', context: 'lint', target_url: null };
  assert.deepEqual([commitStatusValues({ ...status, state: 'pending' }).state, commitStatusValues({ ...status, state: 'pending' }).conclusion], ['pending', null]);
  assert.deepEqual([commitStatusValues({ ...status, state: 'success' }).state, commitStatusValues({ ...status, state: 'success' }).conclusion], ['completed', 'success']);
  assert.equal(checkAggregate([commitStatusValues({ ...status, state: 'error' })]), 'failure');
  assert.equal(checkAggregate([commitStatusValues({ ...status, state: 'success' })]), 'success');
  assert.equal(commitStatusValues({ ...status, state: 'failure' }).checkKey, 'lint');
});

test('closing keywords give same-repository, cross-repository and URL references', () => {
  const body = 'Closes #12, fixes 180DC-VIT-CHENNAI/Other#3 and Resolved: https://github.com/Org/Repo/issues/9. Also Fix #12.';
  assert.deepEqual(closingReferences(body), [
    { fullName: null, number: 12 },
    { fullName: '180dc-vit-chennai/other', number: 3 },
    { fullName: 'org/repo', number: 9 },
  ]);
  for (const keyword of ['close', 'closes', 'closed', 'fix', 'fixes', 'fixed', 'resolve', 'resolves', 'resolved', 'CLOSES']) {
    assert.deepEqual(closingReferences(`${keyword} #4`), [{ fullName: null, number: 4 }], keyword);
  }
});

test('other mentions of an issue, and anything in code, are not closing references', () => {
  assert.deepEqual(closingReferences('See #12 and related to #13'), []);
  assert.deepEqual(closingReferences('prefixes #5, disclosed #6'), []);
  assert.deepEqual(closingReferences('`fixes #1`'), []);
  assert.deepEqual(closingReferences('```\nfixes #2\n```\ncloses #3'), [{ fullName: null, number: 3 }]);
  assert.deepEqual(closingReferences('closes #0'), []);
  assert.deepEqual(closingReferences(null), []);
  assert.deepEqual(closingReferences(''), []);
});

test('mentions are @logins outside code and email addresses, lower-cased, unique and capped', () => {
  assert.deepEqual(mentions('Thanks @Ana and @raj-k, cc @ana! mail me@example.com or foo@bar', 10), ['ana', 'raj-k']);
  assert.deepEqual(mentions('`@code` and ```\n@fenced\n``` but @real', 10), ['real']);
  assert.deepEqual(mentions('@a1 @b2 @c3 @d4', 2), ['a1', 'b2']);
  assert.deepEqual(mentions('(@wrapped) and @trailing-hyphen- ok', 10), ['wrapped']);
  assert.deepEqual(mentions(null, 10), []);
  assert.deepEqual(mentions('@@double @-lead', 10), []);
});

test('issue activity covers the listed actions and nothing else', () => {
  const label = { id: 5, name: 'bug', color: 'x', description: null };
  const payload = { issue: issue({ milestone: { id: 1, number: 1, title: 'M1', state: 'open', due_on: null, open_issues: 0, closed_issues: 0, created_at: 'a', updated_at: 'b', closed_at: null } }), assignee: ana, label };
  const at = '2026-11-02T10:00:00Z';
  assert.deepEqual(activityOf('issues', 'opened', payload), { kind: 'opened', detail: {}, occurredAt: at });
  assert.deepEqual(activityOf('issues', 'assigned', payload), { kind: 'assigned', detail: { assigneeLogin: 'ana' }, occurredAt: at });
  assert.deepEqual(activityOf('issues', 'unassigned', payload)?.detail, { assigneeLogin: 'ana' });
  assert.deepEqual(activityOf('issues', 'labeled', payload)?.detail, { label: 'bug' });
  assert.deepEqual(activityOf('issues', 'unlabeled', payload)?.kind, 'unlabeled');
  assert.deepEqual(activityOf('issues', 'milestoned', payload)?.detail, { milestone: 'M1' });
  assert.equal(activityOf('issues', 'demilestoned', payload)?.kind, 'demilestoned');
  assert.equal(activityOf('issues', 'closed', payload)?.kind, 'closed');
  assert.equal(activityOf('issues', 'reopened', payload)?.kind, 'reopened');
  for (const action of ['edited', 'locked', 'pinned', 'typed', 'deleted']) assert.equal(activityOf('issues', action, payload), null, action);
});

test('comment, pull request and review activity', () => {
  const comment = { id: 99, user: ana, body: 'hi', html_url: 'u', created_at: '2026-11-02T10:30:00Z', updated_at: '2026-11-02T10:30:00Z' };
  assert.deepEqual(activityOf('issue_comment', 'created', { issue: issue(), comment }), { kind: 'commented', detail: { commentId: 99 }, occurredAt: '2026-11-02T10:30:00Z' });
  assert.equal(activityOf('issue_comment', 'edited', { issue: issue(), comment }), null);

  const closed = { pull_request: pull({ state: 'closed', merged: true, merged_at: '2026-11-03T00:00:00Z' }) };
  assert.equal(activityOf('pull_request', 'closed', closed)?.kind, 'merged');
  assert.equal(activityOf('pull_request', 'closed', { pull_request: pull({ state: 'closed' }) })?.kind, 'closed');
  assert.deepEqual(activityOf('pull_request', 'review_requested', { pull_request: pull(), requested_reviewer: raj })?.detail, { reviewerLogin: 'Raj' });
  assert.equal(activityOf('pull_request', 'ready_for_review', { pull_request: pull() })?.kind, 'ready_for_review');
  assert.equal(activityOf('pull_request', 'converted_to_draft', { pull_request: pull() })?.kind, 'converted_to_draft');
  assert.equal(activityOf('pull_request', 'synchronize', { pull_request: pull() }), null);

  const submitted = { pull_request: pull(), review: { id: 1, user: raj, state: 'approved', submitted_at: '2026-11-02T16:00:00Z' } };
  assert.deepEqual(activityOf('pull_request_review', 'submitted', submitted), { kind: 'reviewed', detail: { reviewState: 'approved' }, occurredAt: '2026-11-02T16:00:00Z' });
  assert.equal(activityOf('pull_request_review', 'dismissed', submitted), null);
  assert.equal(activityOf('check_run', 'completed', {}), null);
});

test('notices go to the assignee, the requested reviewer, the pull request author and mentioned logins', () => {
  assert.deepEqual(noticeTargets('issues', 'assigned', { sender: bot, issue: issue(), assignee: ana }, 10), [{ kind: 'assigned', githubUserId: 11, login: 'ana' }]);
  assert.deepEqual(noticeTargets('pull_request', 'review_requested', { sender: bot, pull_request: pull(), requested_reviewer: raj }, 10), [
    { kind: 'review_requested', githubUserId: 22, login: 'Raj' },
  ]);
  assert.deepEqual(
    noticeTargets('pull_request_review', 'submitted', { sender: raj, pull_request: pull(), review: { id: 1, user: raj, state: 'approved' } }, 10),
    [{ kind: 'review_submitted', githubUserId: 11, login: 'ana' }],
  );
  assert.deepEqual(noticeTargets('issues', 'opened', { sender: bot, issue: issue({ body: 'ping @Raj' }) }, 10), [{ kind: 'mentioned', githubUserId: null, login: 'raj' }]);
  const comment = { id: 1, user: ana, body: 'cc @raj', html_url: 'u', created_at: 'a', updated_at: 'a' };
  assert.equal(noticeTargets('issue_comment', 'created', { sender: ana, issue: issue(), comment }, 10).length, 1);
  assert.deepEqual(noticeTargets('issue_comment', 'edited', { sender: ana, issue: issue(), comment }, 10), []);
  assert.deepEqual(noticeTargets('pull_request', 'opened', { sender: bot, pull_request: pull({ body: 'hey @ana, @raj' }) }, 1), [{ kind: 'mentioned', githubUserId: null, login: 'ana' }]);
});

test('nobody is notified about their own action', () => {
  assert.deepEqual(noticeTargets('issues', 'assigned', { sender: ana, issue: issue(), assignee: ana }, 10), []);
  assert.deepEqual(noticeTargets('issues', 'opened', { sender: raj, issue: issue({ body: 'note to @RAJ and @ana' }) }, 10), [{ kind: 'mentioned', githubUserId: null, login: 'ana' }]);
  assert.deepEqual(noticeTargets('pull_request_review', 'submitted', { sender: ana, pull_request: pull(), review: { id: 1, user: ana, state: 'approved' } }, 10), []);
});

test('usersOf lists each user a payload names once', () => {
  const users = usersOf({
    sender: bot,
    issue: issue({ assignees: [raj, ana] }),
    assignee: ana,
    pull_request: pull({ requested_reviewers: [raj] }),
    review: { id: 1, user: raj, state: 'approved' },
    comment: { user: null },
  });
  assert.deepEqual(users.map((u) => u.id).sort((a, b) => a - b), [11, 22, 33]);
  assert.deepEqual(usersOf({}), []);
});
