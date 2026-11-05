import {
  issueKey,
  PASSING_CONCLUSIONS,
  REVIEW_STATES,
  type ActivityDetail,
  type ActivityKind,
  type CheckStatus,
  type CommitCheckState,
  type GhCheckRun,
  type GhIssue,
  type GhLabel,
  type GhMilestone,
  type GhPullRequest,
  type GhRepository,
  type GhReview,
  type GhUser,
  type GitHubNotificationKind,
  type ItemKind,
  type ItemState,
  type ReviewDecision,
  type ReviewState,
  type StoredReview,
  type WebhookPayloads,
} from '../types.ts';

export interface CommonItemValues {
  readonly id: string;
  readonly repositoryId: number;
  readonly number: number;
  readonly kind: ItemKind;
  readonly title: string;
  readonly body: string | null;
  readonly state: ItemState;
  readonly stateReason: string | null;
  readonly htmlUrl: string;
  readonly authorGithubId: number | null;
  readonly authorLogin: string | null;
  readonly commentCount: number | null;
  readonly githubCreatedAt: string;
  readonly githubUpdatedAt: string;
  readonly closedAt: string | null;
  readonly milestone: GhMilestone | null;
  readonly labels: readonly GhLabel[];
  readonly assignees: readonly GhUser[];
}

export interface PullValues {
  readonly draft: boolean;
  readonly merged: boolean;
  readonly mergedAt: string | null;
  readonly headRef: string;
  readonly headSha: string;
  readonly baseRef: string;
  readonly pullUpdatedAt: string;
  readonly requestedReviewers: readonly GhUser[];
}

export function issueValues(repositoryId: number, issue: GhIssue): CommonItemValues {
  return {
    id: issueKey(repositoryId, issue.number),
    repositoryId,
    number: issue.number,
    kind: issue.pull_request ? 'pull' : 'issue',
    title: issue.title,
    body: issue.body,
    state: issue.state,
    stateReason: issue.state_reason ?? null,
    htmlUrl: issue.html_url,
    authorGithubId: issue.user?.id ?? null,
    authorLogin: issue.user?.login ?? null,
    commentCount: issue.comments,
    githubCreatedAt: issue.created_at,
    githubUpdatedAt: issue.updated_at,
    closedAt: issue.closed_at,
    milestone: issue.milestone,
    labels: issue.labels,
    assignees: issue.assignees ?? [],
  };
}

/** Pull-request fields the issue representation carries: a merge time is kept, a missing one never un-merges. */
export function mergedFromIssue(issue: GhIssue): { merged: true; mergedAt: string } | null {
  const mergedAt = issue.pull_request?.merged_at;
  return typeof mergedAt === 'string' ? { merged: true, mergedAt } : null;
}

export function pullCommonValues(repositoryId: number, pull: GhPullRequest): CommonItemValues {
  return {
    id: issueKey(repositoryId, pull.number),
    repositoryId,
    number: pull.number,
    kind: 'pull',
    title: pull.title,
    body: pull.body,
    state: pull.state,
    stateReason: null,
    htmlUrl: pull.html_url,
    authorGithubId: pull.user?.id ?? null,
    authorLogin: pull.user?.login ?? null,
    commentCount: pull.comments ?? null,
    githubCreatedAt: pull.created_at,
    githubUpdatedAt: pull.updated_at,
    closedAt: pull.closed_at,
    milestone: pull.milestone,
    labels: pull.labels,
    assignees: pull.assignees ?? [],
  };
}

export function pullValues(pull: GhPullRequest): PullValues {
  return {
    draft: pull.draft === true,
    merged: pull.merged === true || pull.merged_at !== null,
    mergedAt: pull.merged_at,
    headRef: pull.head.ref,
    headSha: pull.head.sha,
    baseRef: pull.base.ref,
    pullUpdatedAt: pull.updated_at,
    requestedReviewers: pull.requested_reviewers ?? [],
  };
}

/** ISO-8601 timestamps from GitHub share one format, so they compare as strings. */
export function appliesOver(incomingUpdatedAt: string, storedUpdatedAt: string | null | undefined): boolean {
  return storedUpdatedAt == null || incomingUpdatedAt >= storedUpdatedAt;
}

export function dueOnDate(dueOn: string | null): string | null {
  return dueOn ? dueOn.slice(0, 10) : null;
}

export function ownerLogin(repo: GhRepository): string {
  return repo.owner?.login ?? repo.full_name.split('/')[0] ?? '';
}

export function lowerReviewState(state: string): ReviewState | null {
  const lowered = state.toLowerCase();
  return (REVIEW_STATES as readonly string[]).includes(lowered) ? (lowered as ReviewState) : null;
}

export function storedReviewOf(review: GhReview): StoredReview | null {
  const state = lowerReviewState(review.state);
  if (!review.user || !state) return null;
  return { githubUserId: review.user.id, login: review.user.login, state, submittedAt: review.submitted_at ?? null };
}

/**
 * Keeps the latest review per reviewer. A comment never replaces an earlier
 * verdict, and a review older than the stored one is ignored.
 */
export function mergeReview(reviews: readonly StoredReview[], incoming: StoredReview): StoredReview[] {
  const existing = reviews.find((r) => r.githubUserId === incoming.githubUserId);
  if (!existing) return [...reviews, incoming];
  if (existing.submittedAt && incoming.submittedAt && incoming.submittedAt < existing.submittedAt) return [...reviews];
  if (incoming.state === 'commented' && existing.state !== 'commented') return [...reviews];
  return reviews.map((r) => (r.githubUserId === incoming.githubUserId ? incoming : r));
}

export function reviewDecision(reviews: readonly StoredReview[], requestedReviewers: number): ReviewDecision {
  if (reviews.some((r) => r.state === 'changes_requested')) return 'changes_requested';
  if (reviews.some((r) => r.state === 'approved')) return 'approved';
  return requestedReviewers > 0 ? 'review_required' : 'none';
}

export interface CheckRow {
  readonly state: CommitCheckState;
  readonly conclusion: string | null;
}

export function checkAggregate(rows: readonly CheckRow[]): CheckStatus {
  if (rows.length === 0) return 'none';
  const passing: readonly string[] = PASSING_CONCLUSIONS;
  if (rows.some((r) => r.state === 'completed' && !passing.includes(r.conclusion ?? ''))) return 'failure';
  if (rows.some((r) => r.state === 'pending')) return 'pending';
  return 'success';
}

export interface CommitCheckValues {
  readonly sha: string;
  readonly source: 'check_run' | 'status';
  readonly checkKey: string;
  readonly name: string;
  readonly externalId: number;
  readonly state: CommitCheckState;
  readonly conclusion: string | null;
  readonly detailsUrl: string | null;
}

export function checkRunValues(run: GhCheckRun): CommitCheckValues {
  return {
    sha: run.head_sha,
    source: 'check_run',
    checkKey: `${run.app?.id ?? 0}:${run.name}`,
    name: run.name,
    externalId: run.id,
    state: run.status === 'completed' ? 'completed' : 'pending',
    conclusion: run.status === 'completed' ? run.conclusion : null,
    detailsUrl: run.details_url ?? run.html_url ?? null,
  };
}

export function commitStatusValues(status: {
  id: number;
  sha: string;
  context: string;
  state: 'error' | 'failure' | 'pending' | 'success';
  target_url: string | null;
}): CommitCheckValues {
  return {
    sha: status.sha,
    source: 'status',
    checkKey: status.context,
    name: status.context,
    externalId: status.id,
    state: status.state === 'pending' ? 'pending' : 'completed',
    conclusion: status.state === 'pending' ? null : status.state,
    detailsUrl: status.target_url,
  };
}

export interface ClosingReference {
  readonly fullName: string | null;
  readonly number: number;
}

function withoutCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/~~~[\s\S]*?~~~/g, ' ').replace(/`[^`\n]*`/g, ' ');
}

const CLOSING_REFERENCE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)|([\w.-]+\/[\w.-]+)?#(\d+))(?!\w)/gi;

/**
 * Closing keywords of a pull request body. `fullName` is null for a bare
 * `#n`, which means the pull request's own repository; names are lower-cased.
 */
export function closingReferences(body: string | null): ClosingReference[] {
  if (!body) return [];
  const seen = new Set<string>();
  const out: ClosingReference[] = [];
  for (const match of withoutCode(body).matchAll(CLOSING_REFERENCE)) {
    const fullName = (match[1] ?? match[3] ?? null)?.toLowerCase() ?? null;
    const number = Number(match[2] ?? match[4]);
    if (!Number.isSafeInteger(number) || number <= 0) continue;
    const key = `${fullName ?? ''}#${number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fullName, number });
  }
  return out;
}

const MENTION = /(?<![A-Za-z0-9_.+/@-])@([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})(?![A-Za-z0-9_-])/g;

/** @logins outside code, lower-cased, de-duplicated and capped. Email addresses do not count. */
export function mentions(text: string | null | undefined, limit: number): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  for (const match of withoutCode(text).matchAll(MENTION)) {
    seen.add((match[1] as string).toLowerCase());
    if (seen.size >= limit) break;
  }
  return [...seen];
}

type PayloadOf<E extends keyof WebhookPayloads> = WebhookPayloads[E];

export interface ActivityPlan {
  readonly kind: ActivityKind;
  readonly detail: ActivityDetail;
  readonly occurredAt: string;
}

export function activityOf(event: string, action: string | undefined, payload: unknown): ActivityPlan | null {
  if (event === 'issues') {
    const p = payload as PayloadOf<'issues'>;
    const at = p.issue.updated_at;
    switch (action) {
      case 'opened': return { kind: 'opened', detail: {}, occurredAt: at };
      case 'closed': return { kind: 'closed', detail: {}, occurredAt: at };
      case 'reopened': return { kind: 'reopened', detail: {}, occurredAt: at };
      case 'assigned': return { kind: 'assigned', detail: p.assignee ? { assigneeLogin: p.assignee.login } : {}, occurredAt: at };
      case 'unassigned': return { kind: 'unassigned', detail: p.assignee ? { assigneeLogin: p.assignee.login } : {}, occurredAt: at };
      case 'labeled': return { kind: 'labeled', detail: p.label ? { label: p.label.name } : {}, occurredAt: at };
      case 'unlabeled': return { kind: 'unlabeled', detail: p.label ? { label: p.label.name } : {}, occurredAt: at };
      case 'milestoned': return { kind: 'milestoned', detail: p.issue.milestone ? { milestone: p.issue.milestone.title } : {}, occurredAt: at };
      case 'demilestoned': return { kind: 'demilestoned', detail: {}, occurredAt: at };
      default: return null;
    }
  }
  if (event === 'issue_comment') {
    const p = payload as PayloadOf<'issue_comment'>;
    return action === 'created' ? { kind: 'commented', detail: { commentId: p.comment.id }, occurredAt: p.comment.created_at } : null;
  }
  if (event === 'pull_request') {
    const p = payload as PayloadOf<'pull_request'>;
    const pull = p.pull_request;
    const at = pull.updated_at;
    switch (action) {
      case 'opened': return { kind: 'opened', detail: {}, occurredAt: at };
      case 'closed': return { kind: pull.merged === true || pull.merged_at ? 'merged' : 'closed', detail: {}, occurredAt: at };
      case 'reopened': return { kind: 'reopened', detail: {}, occurredAt: at };
      case 'assigned': return { kind: 'assigned', detail: p.assignee ? { assigneeLogin: p.assignee.login } : {}, occurredAt: at };
      case 'unassigned': return { kind: 'unassigned', detail: p.assignee ? { assigneeLogin: p.assignee.login } : {}, occurredAt: at };
      case 'labeled': return { kind: 'labeled', detail: p.label ? { label: p.label.name } : {}, occurredAt: at };
      case 'unlabeled': return { kind: 'unlabeled', detail: p.label ? { label: p.label.name } : {}, occurredAt: at };
      case 'review_requested': return { kind: 'review_requested', detail: p.requested_reviewer ? { reviewerLogin: p.requested_reviewer.login } : {}, occurredAt: at };
      case 'ready_for_review': return { kind: 'ready_for_review', detail: {}, occurredAt: at };
      case 'converted_to_draft': return { kind: 'converted_to_draft', detail: {}, occurredAt: at };
      default: return null;
    }
  }
  if (event === 'pull_request_review') {
    const p = payload as PayloadOf<'pull_request_review'>;
    const state = lowerReviewState(p.review.state);
    if (action !== 'submitted' || !state) return null;
    return { kind: 'reviewed', detail: { reviewState: state }, occurredAt: p.review.submitted_at ?? p.pull_request.updated_at };
  }
  return null;
}

export interface NoticeTarget {
  readonly kind: GitHubNotificationKind;
  readonly githubUserId: number | null;
  readonly login: string | null;
}

/** Who may get a notice for an event; the sender's own action never notifies them. */
export function noticeTargets(event: string, action: string | undefined, payload: unknown, mentionLimit: number): NoticeTarget[] {
  const sender = (payload as { sender?: GhUser }).sender;
  const targets: NoticeTarget[] = [];
  const byUser = (kind: GitHubNotificationKind, user: GhUser | null | undefined) => {
    if (user) targets.push({ kind, githubUserId: user.id, login: user.login });
  };
  const byLogins = (text: string | null | undefined) => {
    for (const login of mentions(text, mentionLimit)) targets.push({ kind: 'mentioned', githubUserId: null, login });
  };

  if (event === 'issues') {
    const p = payload as PayloadOf<'issues'>;
    if (action === 'assigned') byUser('assigned', p.assignee);
    if (action === 'opened') byLogins(p.issue.body);
  } else if (event === 'issue_comment') {
    const p = payload as PayloadOf<'issue_comment'>;
    if (action === 'created') byLogins(p.comment.body);
  } else if (event === 'pull_request') {
    const p = payload as PayloadOf<'pull_request'>;
    if (action === 'assigned') byUser('assigned', p.assignee);
    if (action === 'review_requested') byUser('review_requested', p.requested_reviewer);
    if (action === 'opened') byLogins(p.pull_request.body);
  } else if (event === 'pull_request_review') {
    const p = payload as PayloadOf<'pull_request_review'>;
    if (action === 'submitted') byUser('review_submitted', p.pull_request.user);
  }

  if (!sender) return targets;
  return targets.filter((t) => t.githubUserId !== sender.id && t.login?.toLowerCase() !== sender.login.toLowerCase());
}

export function usersOf(payload: unknown): GhUser[] {
  const p = payload as {
    sender?: GhUser;
    issue?: GhIssue;
    pull_request?: GhPullRequest;
    assignee?: GhUser | null;
    requested_reviewer?: GhUser;
    review?: GhReview;
    comment?: { user: GhUser | null };
  };
  const users: Array<GhUser | null | undefined> = [p.sender, p.assignee, p.requested_reviewer, p.review?.user, p.comment?.user];
  for (const item of [p.issue, p.pull_request]) {
    if (!item) continue;
    users.push(item.user, ...(item.assignees ?? []));
    if ('requested_reviewers' in item) users.push(...(item.requested_reviewers ?? []));
  }
  const byId = new Map<number, GhUser>();
  for (const user of users) if (user) byId.set(user.id, user);
  return [...byId.values()];
}
