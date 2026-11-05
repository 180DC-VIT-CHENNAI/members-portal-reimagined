import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACTIVITY_KINDS,
  BOARD_COLUMN_TITLES,
  BOARD_COLUMNS,
  GITHUB_NOTIFICATION_KINDS,
  type BoardResponse,
  type GitHubStatusResponse,
  type GitHubUserRef,
  type InstallationView,
  type IssueCard,
  type LabelView,
  type LinkedItemRef,
  LINK_RESULTS,
  type MyWorkItem,
  type PullFacts,
} from '../server/github/types.ts';
import {
  activityRef,
  activityText,
  afterFailure,
  attemptFor,
  attributionNote,
  boardQuery,
  boardTotal,
  canWriteTo,
  type ChecklistItem,
  checkPresentation,
  checkResult,
  classifyWriteError,
  cleanLogin,
  commentsErrorText,
  createAnyway,
  deliveryPresentation,
  filtersActive,
  findCard,
  installationPresentation,
  isLogin,
  isWebUrl,
  issueDraft,
  issueFingerprint,
  issuePatch,
  issuePath,
  itemRef,
  labelChanges,
  labelColor,
  linkedRef,
  linkedState,
  linkResultNotice,
  milestonePercent,
  moveCard,
  movedCard,
  myWorkSections,
  NO_FILTERS,
  noticeText,
  parseColumn,
  parseLinkResult,
  placeCard,
  recentlyClosed,
  repositoryProblems,
  reviewPresentation,
  setupChecklist,
  sortCards,
  startAttempt,
  stateOf,
  syncPresentation,
  tokenStatePresentation,
  uniqueLabelNames,
  userLabel,
  visibleLabels,
  writeNotes,
} from './github-view.ts';

const NOW = new Date('2026-11-05T10:00:00Z');

const ana: GitHubUserRef = { githubUserId: 1, login: 'ana-rao', person: { id: 'person_ana', fullName: 'Ana Rao', photoKey: null } };
const octo: GitHubUserRef = { githubUserId: 2, login: 'octo', person: null };

function card(over: Partial<IssueCard> & { id: string }): IssueCard {
  return {
    kind: 'issue',
    repository: { id: 1, fullName: '180DC-VIT-CHENNAI/site' },
    number: 1,
    title: 'Fix the login page',
    state: 'open',
    stateReason: null,
    column: 'backlog',
    htmlUrl: 'https://github.com/180DC-VIT-CHENNAI/site/issues/1',
    author: null,
    assignees: [],
    labels: [],
    milestone: null,
    dueDate: null,
    effectiveDueDate: null,
    overdue: false,
    commentCount: 0,
    links: [],
    pull: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    closedAt: null,
    version: 1,
    ...over,
  };
}

function board(cards: readonly IssueCard[]): BoardResponse {
  return {
    truncated: false,
    columns: BOARD_COLUMNS.map((key) => ({ key, title: BOARD_COLUMN_TITLES[key], items: cards.filter((item) => item.column === key) })),
  };
}

const columnIds = (value: BoardResponse) => Object.fromEntries(value.columns.map((column) => [column.key, column.items.map((item) => item.id)]));

function pullFacts(over: Partial<PullFacts> = {}): PullFacts {
  return { draft: false, merged: false, mergedAt: null, headRef: null, baseRef: null, checkStatus: 'none', reviewDecision: 'none', requestedReviewers: [], reviews: [], ...over };
}

function link(over: Partial<LinkedItemRef> = {}): LinkedItemRef {
  return { id: '1-2', repositoryFullName: '180DC-VIT-CHENNAI/site', number: 2, kind: 'pull', title: 'Fix it', state: 'open', merged: false, checkStatus: 'none', htmlUrl: null, ...over };
}

const label = (id: number, name: string, status: LabelView['status'] = null): LabelView => ({ id, name, color: 'c5def5', status });

function minter() {
  let count = 0;
  return () => `id-${++count}`;
}

test('open columns sort by due date with undated last, then by latest update', () => {
  const sorted = sortCards('todo', [
    card({ id: 'a', updatedAt: '2026-11-04T00:00:00Z' }),
    card({ id: 'b', effectiveDueDate: '2026-11-10', updatedAt: '2026-11-01T00:00:00Z' }),
    card({ id: 'c', effectiveDueDate: '2026-11-10', updatedAt: '2026-11-03T00:00:00Z' }),
    card({ id: 'd', effectiveDueDate: '2026-11-08', updatedAt: '2026-11-01T00:00:00Z' }),
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ['d', 'c', 'b', 'a']);
});

test('the done column sorts by close time, newest first', () => {
  const sorted = sortCards('done', [
    card({ id: 'a', state: 'closed', closedAt: '2026-11-01T00:00:00Z' }),
    card({ id: 'b', state: 'closed', closedAt: '2026-11-03T00:00:00Z' }),
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ['b', 'a']);
});

test('a move leaves the other cards alone and hands back the original for a rollback', () => {
  const before = board([card({ id: 'a', column: 'todo' }), card({ id: 'b', column: 'todo' })]);
  const untouched = JSON.stringify(before);
  const moved = moveCard(before, 'a', 'in_progress', NOW);
  assert.ok(moved);
  assert.equal(JSON.stringify(before), untouched, 'the board passed in is not changed');
  assert.deepEqual(columnIds(moved.board), { backlog: [], todo: ['b'], in_progress: ['a'], in_review: [], done: [] });
  assert.equal(moved.original.column, 'todo');
  assert.deepEqual(columnIds(placeCard(moved.board, moved.original)), columnIds(before));
});

test('there is nothing to move for an unknown card or the column it already sits in', () => {
  const before = board([card({ id: 'a', column: 'todo' })]);
  assert.equal(moveCard(before, 'missing', 'done', NOW), null);
  assert.equal(moveCard(before, 'a', 'todo', NOW), null);
});

test('a card moved to Done is closed and no longer overdue; moved back out it reopens and is overdue again', () => {
  const late = card({ id: 'a', column: 'todo', effectiveDueDate: '2026-11-01', overdue: true });
  const done = movedCard(late, 'done', NOW);
  assert.equal(done.state, 'closed');
  assert.equal(done.stateReason, 'completed');
  assert.equal(done.closedAt, NOW.toISOString());
  assert.equal(done.overdue, false);
  const reopened = movedCard(done, 'todo', NOW);
  assert.equal(reopened.state, 'open');
  assert.equal(reopened.stateReason, null);
  assert.equal(reopened.closedAt, null);
  assert.equal(reopened.overdue, true);
});

test("placing the server's copy of a card replaces it in its column and keeps board order", () => {
  const before = board([card({ id: 'a', column: 'todo', effectiveDueDate: '2026-11-08' }), card({ id: 'b', column: 'todo', effectiveDueDate: '2026-11-09' })]);
  const placed = placeCard(before, card({ id: 'b', column: 'todo', effectiveDueDate: '2026-11-07', version: 2 }));
  assert.deepEqual(columnIds(placed).todo, ['b', 'a']);
  assert.equal(findCard(placed, 'b')?.version, 2);
  assert.equal(boardTotal(placed), 2);
});

test('board filters leave out what is unset and trim the search', () => {
  assert.deepEqual(boardQuery(NO_FILTERS), {});
  assert.deepEqual(boardQuery({ ...NO_FILTERS, repo: '12', assignee: 'me', q: '  login bug ' }), { repo: '12', assignee: 'me', q: 'login bug' });
  assert.equal(filtersActive({ ...NO_FILTERS, q: '   ' }), false);
  assert.equal(filtersActive({ ...NO_FILTERS, label: 'bug' }), true);
});

test('write failures are told apart by what the client may safely do next', () => {
  const failure = (code: string, status: number | null) => classifyWriteError({ code, status });
  assert.equal(failure('github_outcome_unknown', 502), 'unknown_outcome');
  assert.equal(failure('request_outcome_unknown', 409), 'unknown_outcome');
  assert.equal(failure('request_in_progress', 409), 'in_progress');
  assert.equal(failure('request_id_reused', 409), 'id_reused');
  assert.equal(failure('network', null), 'retry');
  assert.equal(failure('github_rate_limited', 503), 'retry');
  assert.equal(failure('github_validation_failed', 422), 'rejected');
  assert.equal(failure('repository_archived', 409), 'rejected');
});

test('a create keeps its request id while the content is the same and gets a new one after an edit', () => {
  const mint = minter();
  const first = attemptFor(startAttempt(mint), 'content-1', mint);
  assert.equal(first.requestId, 'id-1');
  assert.equal(attemptFor(first, 'content-1', mint).requestId, 'id-1');
  const edited = attemptFor(first, 'content-2', mint);
  assert.equal(edited.requestId, 'id-2');
  assert.equal(edited.fingerprint, 'content-2');
});

test('after an unknown outcome the attempt stays locked until the user creates anyway', () => {
  const mint = minter();
  const sent = attemptFor(startAttempt(mint), 'content', mint);
  const locked = afterFailure(sent, 'unknown_outcome', mint);
  assert.equal(locked.unknown, true);
  assert.equal(locked.requestId, sent.requestId);
  assert.equal(attemptFor(locked, 'edited', mint), locked);
  const again = createAnyway('content', mint);
  assert.notEqual(again.requestId, sent.requestId);
  assert.equal(again.unknown, false);
});

test('an in-progress or unreachable create retries with the same id, and a refused id is replaced', () => {
  const mint = minter();
  const sent = attemptFor(startAttempt(mint), 'content', mint);
  assert.equal(afterFailure(sent, 'in_progress', mint), sent);
  assert.equal(afterFailure(sent, 'retry', mint), sent);
  assert.equal(afterFailure(sent, 'rejected', mint), sent);
  const replaced = afterFailure(sent, 'id_reused', mint);
  assert.notEqual(replaced.requestId, sent.requestId);
  assert.equal(replaced.fingerprint, null);
});

test('the create fingerprint ignores the order of lists and fills in the defaults', () => {
  const base = { repositoryId: 1, title: 'Fix login', assigneePersonIds: ['b', 'a'], labels: ['x', 'y'] };
  assert.equal(issueFingerprint(base), issueFingerprint({ ...base, assigneePersonIds: ['a', 'b'], labels: ['y', 'x'] }));
  assert.notEqual(issueFingerprint(base), issueFingerprint({ ...base, title: 'Fix signup' }));
  assert.equal(
    issueFingerprint({ repositoryId: 1, title: 'T' }),
    issueFingerprint({ repositoryId: 1, title: 'T', body: '', labels: [], assigneePersonIds: [], column: 'backlog', dueDate: null, milestoneNumber: null }),
  );
});

test('only a write that went out as the app carries an attribution note, and the reason changes it', () => {
  const app = (fallbackReason: 'not_linked' | 'no_token' | 'token_revoked' | 'user_forbidden') =>
    attributionNote({ mode: 'app', login: null, fallbackReason, appliedAsApp: [] });
  assert.equal(attributionNote({ mode: 'user', login: 'ana-rao', fallbackReason: null, appliedAsApp: [] }), null);
  const notes = [app('not_linked'), app('no_token'), app('token_revoked'), app('user_forbidden')];
  assert.ok(notes.every((note) => typeof note === 'string' && note.length > 0));
  assert.equal(new Set(notes).size, 3, 'no_token and token_revoked share one note');
});

test('write notes name logins GitHub did not assign and fields the app had to set', () => {
  const notes = writeNotes({
    attribution: { mode: 'user', login: 'ana-rao', fallbackReason: null, appliedAsApp: ['labels', 'assignees'] },
    ignoredAssignees: ['ghost'],
  });
  assert.equal(notes.length, 2);
  assert.ok(notes[0].includes('@ghost'));
  assert.deepEqual(writeNotes({ attribution: { mode: 'app', login: null, fallbackReason: 'not_linked', appliedAsApp: [] }, ignoredAssignees: [] }), []);
});

test('every activity and notice kind reads as a sentence about its actor and item', () => {
  for (const kind of ACTIVITY_KINDS) assert.ok(activityText({ kind, actor: ana, detail: {} }).includes('Ana Rao'), kind);
  assert.ok(activityText({ kind: 'labeled', actor: octo, detail: { label: 'bug' } }).includes('bug'));
  assert.ok(activityText({ kind: 'assigned', actor: octo, detail: { assigneeLogin: 'ana-rao' } }).includes('@ana-rao'));
  assert.ok(activityText({ kind: 'opened', actor: null, detail: {} }).length > 0);
  const item = { id: '1-7', kind: 'issue' as const, number: 7, title: 'Fix login', repositoryFullName: '180DC-VIT-CHENNAI/site' };
  for (const kind of GITHUB_NOTIFICATION_KINDS) {
    const text = noticeText({ kind, actor: octo, item });
    assert.ok(text.includes('@octo') && text.includes('site#7'), kind);
  }
});

test('an overdue item is listed once, under Overdue', () => {
  const project = { id: 'project_site', name: 'Website' };
  const item = (id: string): MyWorkItem => ({ ...card({ id }), project });
  const sections = myWorkSections({ linked: true, login: 'ana-rao', assigned: [item('a'), item('b')], reviewRequested: [item('c')], authored: [], overdue: [item('a')] });
  assert.deepEqual(sections.map((section) => section.key), ['overdue', 'assigned', 'review', 'authored']);
  assert.deepEqual(sections.map((section) => section.items.map((entry) => entry.id)), [['a'], ['b'], ['c'], []]);
});

test('only known ?github= values are read, and each has a notice', () => {
  for (const result of LINK_RESULTS) {
    assert.equal(parseLinkResult(result), result);
    assert.ok(linkResultNotice(result).title.length > 0, result);
  }
  assert.equal(parseLinkResult('anything'), null);
  assert.equal(parseLinkResult(null), null);
  assert.equal(linkResultNotice('linked').tone, 'success');
  assert.equal(linkResultNotice('taken').tone, 'error');
});

test('logins are cleaned from pasted forms and checked against the GitHub rule', () => {
  assert.equal(cleanLogin('  @octocat '), 'octocat');
  assert.equal(cleanLogin('https://github.com/octocat/'), 'octocat');
  assert.equal(cleanLogin('github.com/octocat'), 'octocat');
  assert.equal(cleanLogin('octocat'), 'octocat');
  for (const valid of ['octocat', 'a', 'a-b', 'A1-b2', 'x'.repeat(39)]) assert.equal(isLogin(valid), true, valid);
  for (const invalid of ['', '-ab', 'ab-', 'a--b', 'a_b', 'a b', 'x'.repeat(40)]) assert.equal(isLogin(invalid), false, invalid);
});

test('check, review and item states map to tones', () => {
  assert.deepEqual((['success', 'failure', 'pending', 'none'] as const).map((value) => checkPresentation(value).tone), ['success', 'error', 'warning', 'neutral']);
  assert.equal(reviewPresentation('none'), null);
  assert.deepEqual((['approved', 'changes_requested', 'review_required'] as const).map((value) => reviewPresentation(value)?.tone), ['success', 'error', 'warning']);

  const pull = (state: 'open' | 'closed', facts: Partial<PullFacts>) => stateOf({ kind: 'pull', state, stateReason: null, pull: pullFacts(facts) });
  assert.equal(pull('closed', { merged: true }).tone, 'accent');
  assert.equal(pull('closed', {}).tone, 'neutral');
  assert.equal(pull('open', { draft: true }).tone, 'neutral');
  assert.equal(pull('open', {}).tone, 'success');
  const issue = (state: 'open' | 'closed', stateReason: string | null) => stateOf({ kind: 'issue', state, stateReason, pull: null });
  assert.equal(issue('open', null).tone, 'success');
  assert.equal(issue('closed', 'completed').tone, 'accent');
  assert.equal(issue('closed', 'not_planned').tone, 'neutral');
});

test('a single check is passed, skipped, running or failed by its state and conclusion', () => {
  assert.equal(checkResult({ state: 'pending', conclusion: null }).tone, 'warning');
  assert.equal(checkResult({ state: 'completed', conclusion: 'success' }).tone, 'success');
  assert.equal(checkResult({ state: 'completed', conclusion: 'skipped' }).tone, 'neutral');
  assert.equal(checkResult({ state: 'completed', conclusion: 'neutral' }).tone, 'neutral');
  for (const conclusion of ['failure', 'timed_out', 'cancelled', 'action_required', null]) {
    assert.equal(checkResult({ state: 'completed', conclusion }).tone, 'error', String(conclusion));
  }
});

test('a linked item shows what matters for its kind', () => {
  assert.equal(linkedState(link({ state: null })).tone, 'neutral');
  assert.equal(linkedState(link({ kind: 'issue', state: 'open' })).tone, 'success');
  assert.equal(linkedState(link({ kind: 'issue', state: 'closed' })).tone, 'neutral');
  assert.equal(linkedState(link({ merged: true, state: 'closed' })).tone, 'accent');
  assert.equal(linkedState(link({ state: 'closed' })).tone, 'neutral');
  assert.equal(linkedState(link({ checkStatus: 'failure' })).tone, 'error');
  assert.equal(linkedState(link({ checkStatus: 'pending' })).tone, 'warning');
  assert.equal(linkedState(link({ checkStatus: 'success' })).tone, 'success');
  assert.equal(linkedState(link({ checkStatus: 'none' })).tone, 'success');
});

test('status labels are not tags, and label names are listed once', () => {
  const labels = [label(1, 'bug'), label(2, 'status: todo', 'todo'), label(3, 'Bug'), label(4, 'design')];
  assert.deepEqual(visibleLabels(labels).map((item) => item.name), ['bug', 'Bug', 'design']);
  assert.deepEqual(uniqueLabelNames([{ labels }, { labels: [label(5, 'api')] }]), ['api', 'bug', 'design']);
});

test('label colours are used only when they are six hex digits', () => {
  assert.equal(labelColor('5319E7'), '#5319e7');
  for (const bad of ['#5319e7', 'zzzzzz', 'abc', '', '5319e7ff']) assert.equal(labelColor(bad), null, bad);
});

test('references are short inside a repository and qualified outside it', () => {
  const item = card({ id: '1-7', number: 7 });
  assert.equal(itemRef(item), 'site#7');
  assert.equal(itemRef(item, true), '180DC-VIT-CHENNAI/site#7');
  assert.equal(linkedRef(link({ number: 9 }), '180DC-VIT-CHENNAI/site'), '#9');
  assert.equal(linkedRef(link({ number: 9, repositoryFullName: '180DC-VIT-CHENNAI/api' }), '180DC-VIT-CHENNAI/site'), 'api#9');
  assert.equal(linkedRef(link({ number: 9, repositoryFullName: null })), '#9');
  assert.equal(userLabel(ana), 'Ana Rao');
  assert.equal(userLabel(octo), '@octo');
  assert.equal(issuePath('123-4'), '/github/issues/123-4');
});

function installation(over: Partial<InstallationView> = {}): InstallationView {
  return { id: 1, accountLogin: '180DC-VIT-CHENNAI', repositorySelection: 'all', suspendedAt: null, deletedAt: null, reposSyncedAt: null, missingPermissions: [], ...over };
}

function status(over: Partial<GitHubStatusResponse> = {}): GitHubStatusResponse {
  return {
    org: '180DC-VIT-CHENNAI',
    configured: { app: true, webhook: true, linking: false, userTokens: false },
    configError: null,
    installations: [installation()],
    repositories: { total: 3, mapped: 1, failing: 0 },
    deliveries: { lastReceivedAt: '2026-11-05T00:00:00Z', failedLast24h: 0 },
    ...over,
  };
}

const doneByKey = (items: readonly ChecklistItem[]) => Object.fromEntries(items.map((item) => [item.key, item.done]));

test('the setup checklist follows the status, and optional steps never block it', () => {
  const ready = setupChecklist(status());
  assert.deepEqual(doneByKey(ready), { app: true, webhook: true, installed: true, permissions: true, deliveries: true, mapped: true, linking: false, tokens: false });
  assert.equal(ready.filter((item) => !item.optional).every((item) => item.done), true);
  assert.equal(doneByKey(setupChecklist(status({ configError: 'app_id_invalid' }))).app, false);
  assert.equal(doneByKey(setupChecklist(status({ configured: { app: true, webhook: false, linking: false, userTokens: false } }))).webhook, false);
  assert.equal(doneByKey(setupChecklist(status({ installations: [installation({ missingPermissions: ['issues'] })] }))).permissions, false);
  const suspended = doneByKey(setupChecklist(status({ installations: [installation({ suspendedAt: '2026-11-04T00:00:00Z' })] })));
  assert.equal(suspended.installed, false);
  assert.equal(suspended.permissions, false);
  assert.equal(doneByKey(setupChecklist(status({ deliveries: { lastReceivedAt: null, failedLast24h: 0 } }))).deliveries, false);
  assert.equal(doneByKey(setupChecklist(status({ repositories: { total: 3, mapped: 0, failing: 0 } }))).mapped, false);
});

test('admin rows show sync, installation, delivery and token state with a tone', () => {
  type SyncRow = Parameters<typeof syncPresentation>[0];
  const row = (over: Partial<SyncRow> = {}): SyncRow => ({ project: { id: 'project_site', name: 'Website' }, removed: false, syncStatus: 'idle', lastSyncedAt: '2026-11-05T00:00:00Z', ...over });
  assert.equal(syncPresentation(row()).tone, 'success');
  assert.equal(syncPresentation(row({ project: null })).tone, 'neutral');
  assert.equal(syncPresentation(row({ removed: true })).tone, 'error');
  assert.equal(syncPresentation(row({ syncStatus: 'failed' })).tone, 'error');
  assert.equal(syncPresentation(row({ syncStatus: 'running' })).tone, 'warning');
  assert.equal(syncPresentation(row({ syncStatus: 'queued' })).tone, 'warning');
  assert.equal(syncPresentation(row({ lastSyncedAt: null })).tone, 'warning');

  assert.equal(installationPresentation({ suspendedAt: null, deletedAt: null }).tone, 'success');
  assert.equal(installationPresentation({ suspendedAt: '2026-11-04T00:00:00Z', deletedAt: null }).tone, 'warning');
  assert.equal(installationPresentation({ suspendedAt: null, deletedAt: '2026-11-04T00:00:00Z' }).tone, 'error');

  assert.deepEqual((['processed', 'ignored', 'failed', 'processing'] as const).map((value) => deliveryPresentation(value).tone), ['success', 'neutral', 'error', 'warning']);
  assert.deepEqual((['active', 'revoked', 'none'] as const).map((value) => tokenStatePresentation(value).tone), ['success', 'warning', 'neutral']);
});

test('parseColumn accepts only the five board columns', () => {
  for (const column of BOARD_COLUMNS) assert.equal(parseColumn(column), column);
  assert.equal(parseColumn('blocked'), null);
  assert.equal(parseColumn(''), null);
});

test('only http and https addresses are followed away from the app', () => {
  assert.equal(isWebUrl('https://github.com/login/oauth/authorize?client_id=abc'), true);
  assert.equal(isWebUrl('http://127.0.0.1:4010/login/oauth/authorize'), true);
  assert.equal(isWebUrl('javascript:alert(1)'), false);
  assert.equal(isWebUrl('data:text/html,hi'), false);
  assert.equal(isWebUrl('/people/me'), false);
  assert.equal(isWebUrl(''), false);
});

test('an edit sends only the fields that changed, with the version it started from', () => {
  const current = issueDraft({
    title: 'Fix login',
    body: null,
    milestone: { id: 1, number: 3, title: 'v1', state: 'open', dueOn: null },
    dueDate: '2026-12-01',
  });
  assert.deepEqual(current, { title: 'Fix login', body: '', milestoneNumber: 3, dueDate: '2026-12-01' });
  assert.equal(issuePatch(current, { ...current }, 4), null);
  assert.deepEqual(issuePatch(current, { ...current, title: 'Fix sign-in' }, 4), { expectedVersion: 4, title: 'Fix sign-in' });
  assert.deepEqual(issuePatch(current, { ...current, milestoneNumber: null, dueDate: null }, 4), { expectedVersion: 4, milestoneNumber: null, dueDate: null });
  assert.deepEqual(issuePatch(current, { ...current, body: 'More detail' }, 7), { expectedVersion: 7, body: 'More detail' });
});

test('label changes list what to add and what to remove', () => {
  assert.deepEqual(labelChanges(['bug', 'ui'], ['ui', 'docs']), { add: ['docs'], remove: ['bug'] });
  assert.deepEqual(labelChanges(['bug'], ['bug']), { add: [], remove: [] });
  assert.deepEqual(labelChanges([], ['a', 'b']), { add: ['a', 'b'], remove: [] });
});

test('comments that could not be loaded each get an explanation', () => {
  const texts = (['github_not_configured', 'github_unavailable', 'github_rate_limited'] as const).map(commentsErrorText);
  assert.equal(new Set(texts).size, 3);
});

test('repository problems rank a lost repository above an archived or failing one', () => {
  type RepoInput = Parameters<typeof repositoryProblems>[0][number];
  const repo = (over: Partial<RepoInput> = {}): RepoInput => ({ id: 1, fullName: '180DC-VIT-CHENNAI/site', archived: false, removed: false, syncStatus: 'idle', ...over });
  assert.deepEqual(repositoryProblems([repo()]), []);
  const problems = repositoryProblems([repo({ id: 1, syncStatus: 'failed' }), repo({ id: 2, removed: true }), repo({ id: 3, archived: true })]);
  assert.deepEqual(problems.map((problem) => [problem.key, problem.tone]), [['2:removed', 'error'], ['1:failed', 'warning'], ['3:archived', 'warning']]);
  assert.equal(canWriteTo(repo()), true);
  assert.equal(canWriteTo(repo({ archived: true })), false);
  assert.equal(canWriteTo(repo({ removed: true })), false);
  assert.equal(canWriteTo(undefined), false);
});

test('milestone progress counts closed work and the last week of closings', () => {
  assert.equal(milestonePercent(0, 0), 0);
  assert.equal(milestonePercent(3, 1), 25);
  assert.equal(milestonePercent(0, 4), 100);
  const progress = { closedByDay: Array.from({ length: 10 }, (_, index) => ({ date: `2026-11-${String(index + 1).padStart(2, '0')}`, closed: index === 0 ? 5 : 1 })) };
  assert.equal(recentlyClosed(progress), 7);
  assert.equal(recentlyClosed(progress, 10), 14);
  assert.equal(recentlyClosed({ closedByDay: [] }), 0);
});

test('an activity row names its item by repository and number', () => {
  const repositories = [{ id: 42, fullName: '180DC-VIT-CHENNAI/site' }];
  assert.equal(activityRef('42-7', repositories), 'site#7');
  assert.equal(activityRef('99-7', repositories), '#7');
  assert.equal(activityRef(null, repositories), null);
});
