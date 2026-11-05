/**
 * Pure view logic of the GitHub screens (project board, pull requests, My work,
 * issue page, admin page, profile card). No React and no `void/*` imports, so
 * `node --test` loads it as it is; constants and types come from the shared
 * contract in `../server/github/types.ts`.
 */
import {
  BOARD_COLUMN_TITLES,
  BOARD_COLUMNS,
  LINK_RESULTS,
  PASSING_CONCLUSIONS,
  type ActivityView,
  type Attribution,
  type BoardColumn,
  type BoardResponse,
  type CheckStatus,
  type CheckView,
  type CreateIssueInput,
  type DeliveryStatus,
  type GitHubConfigError,
  type GitHubNoticeView,
  type GitHubStatusResponse,
  type GitHubUserRef,
  type InstallationView,
  type IssueCard,
  type IssueDetail,
  type IssueWriteResponse,
  type LabelView,
  type LinkedItemRef,
  type LinkResult,
  type MilestoneProgress,
  type MyWorkItem,
  type MyWorkResponse,
  type ProjectRepository,
  type RepositoryAdminRow,
  type RepositoryRef,
  type ReviewDecision,
  type ReviewState,
  type UpdateIssueInput,
  type UserTokenState,
} from '../server/github/types.ts';

export type Tone = 'success' | 'warning' | 'error' | 'accent' | 'neutral';

/** Text first, tone second: colour never carries a state on its own. */
export interface Presentation {
  readonly label: string;
  readonly tone: Tone;
}

/** The `badge-*` class of a tone; neutral is the plain badge. */
export function toneClass(tone: Tone): string {
  return tone === 'neutral' ? '' : `badge-${tone}`;
}

export function repoName(fullName: string): string {
  const slash = fullName.lastIndexOf('/');
  return slash === -1 ? fullName : fullName.slice(slash + 1);
}

/** `repo#12`, or `owner/repo#12` when `full`. */
export function itemRef(item: { readonly repository: { readonly fullName: string }; readonly number: number }, full = false): string {
  return `${full ? item.repository.fullName : repoName(item.repository.fullName)}#${item.number}`;
}

/** `#34` for a link inside the same repository, otherwise `repo#34`. */
export function linkedRef(link: LinkedItemRef, sameRepository?: string): string {
  if (!link.repositoryFullName || link.repositoryFullName === sameRepository) return `#${link.number}`;
  return `${repoName(link.repositoryFullName)}#${link.number}`;
}

export function issuePath(id: string): string {
  return `/github/issues/${encodeURIComponent(id)}`;
}

/** A linked person by name, an unlinked GitHub user by @login. */
export function userLabel(user: GitHubUserRef): string {
  return user.person?.fullName ?? `@${user.login}`;
}

/** Labels shown on cards: status labels are the board column, not a tag. */
export function visibleLabels(labels: readonly LabelView[]): LabelView[] {
  return labels.filter((label) => label.status === null);
}

/** Label names (without status labels) across repositories, A to Z. */
export function uniqueLabelNames(repositories: ReadonlyArray<{ readonly labels: readonly LabelView[] }>): string[] {
  const names = new Map<string, string>();
  for (const repository of repositories) {
    for (const label of visibleLabels(repository.labels)) {
      const key = label.name.toLowerCase();
      if (!names.has(key)) names.set(key, label.name);
    }
  }
  return [...names.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, name]) => name);
}

const HEX_COLOR = /^[0-9a-fA-F]{6}$/;

/** GitHub sends label colours as six hex digits without '#'; anything else is dropped. */
export function labelColor(color: string): string | null {
  return HEX_COLOR.test(color) ? `#${color.toLowerCase()}` : null;
}

export function checkPresentation(status: CheckStatus): Presentation {
  switch (status) {
    case 'success':
      return { label: 'Checks passing', tone: 'success' };
    case 'failure':
      return { label: 'Checks failing', tone: 'error' };
    case 'pending':
      return { label: 'Checks running', tone: 'warning' };
    default:
      return { label: 'No checks', tone: 'neutral' };
  }
}

/** Null when nobody has reviewed or been asked to. */
export function reviewPresentation(decision: ReviewDecision): Presentation | null {
  switch (decision) {
    case 'approved':
      return { label: 'Approved', tone: 'success' };
    case 'changes_requested':
      return { label: 'Changes requested', tone: 'error' };
    case 'review_required':
      return { label: 'Review required', tone: 'warning' };
    default:
      return null;
  }
}

export function stateOf(item: Pick<IssueCard, 'kind' | 'state' | 'stateReason' | 'pull'>): Presentation {
  if (item.kind === 'pull') {
    if (item.pull?.merged) return { label: 'Merged', tone: 'accent' };
    if (item.state === 'closed') return { label: 'Closed', tone: 'neutral' };
    return item.pull?.draft ? { label: 'Draft', tone: 'neutral' } : { label: 'Open', tone: 'success' };
  }
  if (item.state === 'open') return { label: 'Open', tone: 'success' };
  return item.stateReason === 'not_planned' ? { label: 'Closed as not planned', tone: 'neutral' } : { label: 'Closed', tone: 'accent' };
}

/** A linked item: an issue shows open or closed, a pull request its merge or its checks. */
export function linkedState(link: LinkedItemRef): Presentation {
  if (link.state === null) return { label: 'Not synced', tone: 'neutral' };
  if (link.kind === 'issue') return link.state === 'open' ? { label: 'Open', tone: 'success' } : { label: 'Closed', tone: 'neutral' };
  if (link.merged) return { label: 'Merged', tone: 'accent' };
  if (link.state === 'closed') return { label: 'Closed', tone: 'neutral' };
  return link.checkStatus === 'none' ? { label: 'Open', tone: 'success' } : checkPresentation(link.checkStatus);
}

const CONCLUSION_LABELS: Readonly<Record<string, string>> = {
  failure: 'Failed',
  error: 'Failed',
  cancelled: 'Cancelled',
  timed_out: 'Timed out',
  action_required: 'Action required',
  stale: 'Stale',
  startup_failure: 'Failed to start',
};

/** One check of a pull request's head commit. */
export function checkResult(check: Pick<CheckView, 'state' | 'conclusion'>): Presentation {
  if (check.state === 'pending') return { label: 'Running', tone: 'warning' };
  const conclusion = check.conclusion ?? '';
  if ((PASSING_CONCLUSIONS as readonly string[]).includes(conclusion)) {
    if (conclusion === 'success') return { label: 'Passed', tone: 'success' };
    return { label: conclusion === 'skipped' ? 'Skipped' : 'Neutral', tone: 'neutral' };
  }
  return { label: CONCLUSION_LABELS[conclusion] ?? 'Failed', tone: 'error' };
}

export function reviewVerb(state: ReviewState | undefined): string {
  switch (state) {
    case 'approved':
      return 'approved these changes';
    case 'changes_requested':
      return 'requested changes';
    case 'dismissed':
      return 'dismissed a review';
    default:
      return 'reviewed this';
  }
}

/** UTC date, as the server computes `overdue`. */
export function isoToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

type Columns = BoardResponse['columns'];

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Open columns: due date ascending (none last), then most recently updated. */
function compareOpen(a: IssueCard, b: IssueCard): number {
  const due = cmp(a.effectiveDueDate ?? '\uffff', b.effectiveDueDate ?? '\uffff');
  return due || cmp(b.updatedAt, a.updatedAt) || cmp(a.id, b.id);
}

/** Done: most recently closed first. */
function compareDone(a: IssueCard, b: IssueCard): number {
  return cmp(b.closedAt ?? '', a.closedAt ?? '') || cmp(a.id, b.id);
}

/** The order the board query uses within a column. */
export function sortCards(column: BoardColumn, cards: readonly IssueCard[]): IssueCard[] {
  return [...cards].sort(column === 'done' ? compareDone : compareOpen);
}

export function findCard(board: BoardResponse, id: string): IssueCard | undefined {
  for (const column of board.columns) {
    const hit = column.items.find((item) => item.id === id);
    if (hit) return hit;
  }
  return undefined;
}

export function boardTotal(board: BoardResponse): number {
  return board.columns.reduce((sum, column) => sum + column.items.length, 0);
}

/** Takes the card out of whichever column holds it and puts `card` into its own column, in board order. */
export function placeCard(board: BoardResponse, card: IssueCard): BoardResponse {
  const columns: Columns = board.columns.map((column) => {
    const rest = column.items.filter((item) => item.id !== card.id);
    if (column.key === card.column) return { ...column, items: sortCards(column.key, [...rest, card]) };
    return rest.length === column.items.length ? column : { ...column, items: rest };
  });
  return { ...board, columns };
}

/** The card as the board shows it straight after a move, before GitHub has answered. */
export function movedCard(card: IssueCard, target: BoardColumn, now: Date = new Date()): IssueCard {
  const closed = target === 'done';
  return {
    ...card,
    column: target,
    state: closed ? 'closed' : 'open',
    stateReason: closed ? 'completed' : null,
    closedAt: closed ? (card.closedAt ?? now.toISOString()) : null,
    overdue: !closed && card.effectiveDueDate !== null && card.effectiveDueDate < isoToday(now),
  };
}

/** An optimistic move; `original` is what to put back if GitHub refuses. Null when there is nothing to move. */
export function moveCard(
  board: BoardResponse,
  id: string,
  target: BoardColumn,
  now: Date = new Date(),
): { readonly board: BoardResponse; readonly original: IssueCard } | null {
  const original = findCard(board, id);
  if (!original || original.column === target) return null;
  return { board: placeCard(board, movedCard(original, target, now)), original };
}

export function columnTitle(column: BoardColumn): string {
  return BOARD_COLUMN_TITLES[column];
}

/** Columns a new issue can start in. */
export const CREATE_COLUMNS = BOARD_COLUMNS.filter((column): column is Exclude<BoardColumn, 'done'> => column !== 'done');

export interface BoardFilters {
  readonly repo: string;
  /** A person id, `me` or `none`. */
  readonly assignee: string;
  readonly label: string;
  readonly milestone: string;
  readonly q: string;
}

export const NO_FILTERS: BoardFilters = { repo: '', assignee: '', label: '', milestone: '', q: '' };

/** The query string of GET .../board: unset filters are left out. */
export function boardQuery(filters: BoardFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.repo) query.repo = filters.repo;
  if (filters.assignee) query.assignee = filters.assignee;
  if (filters.label) query.label = filters.label;
  if (filters.milestone) query.milestone = filters.milestone;
  const q = filters.q.trim();
  if (q) query.q = q;
  return query;
}

export function filtersActive(filters: BoardFilters): boolean {
  return Object.keys(boardQuery(filters)).length > 0;
}

export type WriteFailure =
  /** GitHub may or may not have done it: look before trying again. */
  | 'unknown_outcome'
  /** The same request is still being processed. */
  | 'in_progress'
  /** The id was used for different content; the next attempt needs a fresh one. */
  | 'id_reused'
  /** The portal never heard back (offline, timeout, 5xx): the same id is safe to send again. */
  | 'retry'
  /** A definite refusal: fix the input and send again. */
  | 'rejected';

export function classifyWriteError(problem: { readonly status: number | null; readonly code: string }): WriteFailure {
  if (problem.code === 'github_outcome_unknown' || problem.code === 'request_outcome_unknown') return 'unknown_outcome';
  if (problem.code === 'request_in_progress') return 'in_progress';
  if (problem.code === 'request_id_reused') return 'id_reused';
  if (problem.status === null || problem.status >= 500) return 'retry';
  return 'rejected';
}

/** One create (issue or comment): the id goes out with every try of the same content. */
export interface WriteAttempt {
  readonly requestId: string;
  /** What was sent last; null before the first try. */
  readonly fingerprint: string | null;
  /** The last try may or may not have reached GitHub. Only `createAnyway` leaves this state. */
  readonly unknown: boolean;
}

export function startAttempt(mint: () => string): WriteAttempt {
  return { requestId: mint(), fingerprint: null, unknown: false };
}

/**
 * The attempt to send `fingerprint` with. The same content keeps its id, so a retry cannot create twice;
 * changed content after a definite failure gets a fresh id (the server remembers the old id with the old content).
 */
export function attemptFor(previous: WriteAttempt, fingerprint: string, mint: () => string): WriteAttempt {
  if (previous.unknown) return previous;
  if (previous.fingerprint === null) return { ...previous, fingerprint };
  if (previous.fingerprint === fingerprint) return previous;
  return { requestId: mint(), fingerprint, unknown: false };
}

export function afterFailure(previous: WriteAttempt, failure: WriteFailure, mint: () => string): WriteAttempt {
  if (failure === 'unknown_outcome') return { ...previous, unknown: true };
  if (failure === 'id_reused') return startAttempt(mint);
  return previous;
}

/** The user's explicit "create anyway": a new id, after they have looked. */
export function createAnyway(fingerprint: string, mint: () => string): WriteAttempt {
  return { requestId: mint(), fingerprint, unknown: false };
}

export function issueFingerprint(input: Omit<CreateIssueInput, 'requestId'>): string {
  return JSON.stringify([
    input.repositoryId,
    input.title,
    input.body ?? '',
    [...(input.assigneePersonIds ?? [])].sort(),
    [...(input.labels ?? [])].sort(),
    input.milestoneNumber ?? null,
    input.column ?? 'backlog',
    input.dueDate ?? null,
  ]);
}

export const APP_NOTE = 'Saved as the 180DC portal app. Link your GitHub account on your profile to act as yourself.';

/** Why a write went out as the App, in words; null when it went out as the person. */
export function attributionNote(attribution: Attribution): string | null {
  if (attribution.mode === 'user') return null;
  switch (attribution.fallbackReason) {
    case 'no_token':
    case 'token_revoked':
      return 'Saved as the 180DC portal app because your GitHub link needs renewing. Unlink and link your GitHub account again on your profile to act as yourself.';
    case 'user_forbidden':
      return 'Saved as the 180DC portal app because your GitHub account cannot write to this repository.';
    default:
      return APP_NOTE;
  }
}

const APPLIED_AS_APP = { labels: 'labels', assignees: 'assignees', milestone: 'the milestone' } as const;

/** Everything worth telling the writer after a write, besides "saved". */
export function writeNotes(response: Pick<IssueWriteResponse, 'attribution' | 'ignoredAssignees'>): string[] {
  const notes: string[] = [];
  const { attribution, ignoredAssignees } = response;
  if (ignoredAssignees.length > 0) {
    notes.push(`GitHub did not assign ${ignoredAssignees.map((login) => `@${login}`).join(', ')}: they have no access to the repository.`);
  }
  if (attribution.mode === 'user' && attribution.appliedAsApp.length > 0) {
    const what = attribution.appliedAsApp.map((part) => APPLIED_AS_APP[part]).join(' and ');
    notes.push(`Your GitHub account cannot set ${what} on this repository, so the portal app set ${attribution.appliedAsApp.length > 1 ? 'them' : 'it'}.`);
  }
  return notes;
}

export function activityText(view: Pick<ActivityView, 'kind' | 'actor' | 'detail'>): string {
  const actor = view.actor ? userLabel(view.actor) : 'Someone';
  const { detail } = view;
  const person = (login: string | undefined) => (login ? `@${login}` : 'someone');
  switch (view.kind) {
    case 'opened':
      return `${actor} opened this`;
    case 'closed':
      return `${actor} closed this`;
    case 'reopened':
      return `${actor} reopened this`;
    case 'merged':
      return `${actor} merged this pull request`;
    case 'assigned':
      return `${actor} assigned ${person(detail.assigneeLogin)}`;
    case 'unassigned':
      return `${actor} unassigned ${person(detail.assigneeLogin)}`;
    case 'labeled':
      return `${actor} added the label ${detail.label ?? ''}`.trim();
    case 'unlabeled':
      return `${actor} removed the label ${detail.label ?? ''}`.trim();
    case 'milestoned':
      return `${actor} added this to the milestone ${detail.milestone ?? ''}`.trim();
    case 'demilestoned':
      return `${actor} removed this from the milestone ${detail.milestone ?? ''}`.trim();
    case 'commented':
      return `${actor} commented`;
    case 'review_requested':
      return `${actor} requested a review from ${person(detail.reviewerLogin)}`;
    case 'reviewed':
      return `${actor} ${reviewVerb(detail.reviewState)}`;
    case 'ready_for_review':
      return `${actor} marked this ready for review`;
    case 'converted_to_draft':
      return `${actor} converted this to a draft`;
    default: {
      const unhandled: never = view.kind;
      return `${actor} updated this (${String(unhandled)})`;
    }
  }
}

export function noticeText(notice: Pick<GitHubNoticeView, 'kind' | 'actor' | 'item'>): string {
  const who = notice.actor ? userLabel(notice.actor) : 'Someone';
  const ref = `${itemRef({ repository: { fullName: notice.item.repositoryFullName }, number: notice.item.number })} "${notice.item.title}"`;
  switch (notice.kind) {
    case 'assigned':
      return `${who} assigned you to ${ref}`;
    case 'review_requested':
      return `${who} asked you to review ${ref}`;
    case 'review_submitted':
      return `${who} reviewed your pull request ${ref}`;
    case 'mentioned':
      return `${who} mentioned you in ${ref}`;
    default: {
      const unhandled: never = notice.kind;
      return `${who} updated ${ref} (${String(unhandled)})`;
    }
  }
}

export interface MyWorkSection {
  readonly key: 'overdue' | 'assigned' | 'review' | 'authored';
  readonly title: string;
  readonly empty: string;
  readonly items: readonly MyWorkItem[];
}

/** The four sections of My work; an overdue item is listed once, under Overdue. */
export function myWorkSections(work: MyWorkResponse): MyWorkSection[] {
  const overdue = new Set(work.overdue.map((item) => item.id));
  return [
    { key: 'overdue', title: 'Overdue', empty: 'Nothing assigned to you is overdue.', items: work.overdue },
    { key: 'assigned', title: 'Assigned to me', empty: 'Nothing else is assigned to you.', items: work.assigned.filter((item) => !overdue.has(item.id)) },
    { key: 'review', title: 'Waiting for my review', empty: 'No pull requests are waiting for your review.', items: work.reviewRequested },
    { key: 'authored', title: 'My pull requests', empty: 'You have no open pull requests.', items: work.authored },
  ];
}

export function parseLinkResult(value: string | null): LinkResult | null {
  return value !== null && (LINK_RESULTS as readonly string[]).includes(value) ? (value as LinkResult) : null;
}

export interface Notice {
  readonly tone: 'success' | 'error' | 'warning' | 'info';
  readonly title: string;
  readonly body?: string;
}

/** What `?github=<result>` says after GitHub sends the person back to their profile. */
export function linkResultNotice(result: LinkResult): Notice {
  switch (result) {
    case 'linked':
      return { tone: 'success', title: 'GitHub account linked', body: 'Your GitHub account is now linked to your portal profile.' };
    case 'denied':
      return { tone: 'info', title: 'GitHub link cancelled', body: 'You did not authorise the portal on GitHub, so nothing changed.' };
    case 'state_invalid':
      return { tone: 'error', title: 'That link attempt expired', body: 'Start again with the button below.' };
    case 'exchange_failed':
      return { tone: 'error', title: 'GitHub did not complete the link', body: 'Try again in a moment.' };
    case 'taken':
      return { tone: 'error', title: 'That GitHub account is already linked', body: 'It belongs to someone else on the portal. Ask an admin if this looks wrong.' };
    case 'not_configured':
      return { tone: 'warning', title: 'GitHub linking is not set up', body: 'Ask an admin to link your account for you.' };
    default: {
      const unhandled: never = result;
      return { tone: 'info', title: String(unhandled) };
    }
  }
}

export function linkMethodLabel(method: 'oauth' | 'admin'): string {
  return method === 'oauth' ? 'Signed in with GitHub' : 'Linked by an admin';
}

export function tokenStatePresentation(state: UserTokenState | 'none'): Presentation {
  switch (state) {
    case 'active':
      return { label: 'Writes as the member', tone: 'success' };
    case 'revoked':
      return { label: 'Needs relinking', tone: 'warning' };
    default:
      return { label: 'Portal app only', tone: 'neutral' };
  }
}

/** GitHub logins: letters, digits and single hyphens inside, at most 39 characters. */
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** `@name`, `github.com/name` and pasted profile links all become `name`. */
export function cleanLogin(input: string): string {
  return input
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '');
}

export function isLogin(value: string): boolean {
  return LOGIN_PATTERN.test(value);
}

export function configErrorText(error: GitHubConfigError): string {
  switch (error) {
    case 'app_id_invalid':
      return 'GITHUB_APP_ID is not a valid App ID. Copy the numeric "App ID" from the GitHub App settings page.';
    case 'private_key_not_pkcs8':
      return 'GITHUB_APP_PRIVATE_KEY is in the PKCS#1 format that GitHub downloads. Convert it with: openssl pkcs8 -topk8 -nocrypt -in <download>.pem -out app-pkcs8.pem.';
    case 'private_key_invalid':
      return 'GITHUB_APP_PRIVATE_KEY could not be read as a PEM private key. Check that its line breaks survived.';
    case 'token_key_invalid':
      return 'GITHUB_TOKEN_ENCRYPTION_KEY must be the base64 of exactly 32 random bytes.';
    default: {
      const unhandled: never = error;
      return String(unhandled);
    }
  }
}

export interface ChecklistItem {
  readonly key: 'app' | 'webhook' | 'installed' | 'permissions' | 'deliveries' | 'mapped' | 'linking' | 'tokens';
  readonly label: string;
  readonly done: boolean;
  /** Optional features do not block the integration. */
  readonly optional: boolean;
}

function activeInstallations(installations: readonly InstallationView[]): InstallationView[] {
  return installations.filter((installation) => !installation.deletedAt && !installation.suspendedAt);
}

/** The setup steps (design 3.3) with what the status page can tell about each. */
export function setupChecklist(status: GitHubStatusResponse): ChecklistItem[] {
  const active = activeInstallations(status.installations);
  const item = (key: ChecklistItem['key'], label: string, done: boolean, optional = false): ChecklistItem => ({ key, label, done, optional });
  return [
    item('app', 'GitHub App credentials are set and valid', status.configured.app && status.configError === null),
    item('webhook', 'Webhook secret is set', status.configured.webhook),
    item('installed', `The App is installed on ${status.org}`, active.length > 0),
    item('permissions', 'The installation has every permission the portal needs', active.length > 0 && active.every((installation) => installation.missingPermissions.length === 0)),
    item('deliveries', 'GitHub is delivering webhooks', status.deliveries.lastReceivedAt !== null),
    item('mapped', 'At least one repository is mapped to a project', status.repositories.mapped > 0),
    item('linking', 'Members can link their GitHub account (optional)', status.configured.linking, true),
    item('tokens', 'Writes can go out as the member (optional)', status.configured.userTokens, true),
  ];
}

export function installationPresentation(installation: Pick<InstallationView, 'suspendedAt' | 'deletedAt'>): Presentation {
  if (installation.deletedAt) return { label: 'Removed', tone: 'error' };
  if (installation.suspendedAt) return { label: 'Suspended', tone: 'warning' };
  return { label: 'Active', tone: 'success' };
}

export function syncPresentation(row: Pick<RepositoryAdminRow, 'project' | 'removed' | 'syncStatus' | 'lastSyncedAt'>): Presentation {
  if (row.removed) return { label: 'Access lost', tone: 'error' };
  if (!row.project) return { label: 'Not mapped', tone: 'neutral' };
  switch (row.syncStatus) {
    case 'failed':
      return { label: 'Sync failed', tone: 'error' };
    case 'running':
      return { label: 'Syncing', tone: 'warning' };
    case 'queued':
      return { label: 'Queued', tone: 'warning' };
    default:
      return row.lastSyncedAt ? { label: 'Up to date', tone: 'success' } : { label: 'Waiting for first sync', tone: 'warning' };
  }
}

export function deliveryPresentation(status: DeliveryStatus): Presentation {
  switch (status) {
    case 'processed':
      return { label: 'Processed', tone: 'success' };
    case 'ignored':
      return { label: 'Ignored', tone: 'neutral' };
    case 'failed':
      return { label: 'Failed', tone: 'error' };
    default:
      return { label: 'Processing', tone: 'warning' };
  }
}

export function parseColumn(value: string): BoardColumn | null {
  return (BOARD_COLUMNS as readonly string[]).includes(value) ? (value as BoardColumn) : null;
}

/** Only http(s) addresses are followed when the server hands back a URL to leave the app for. */
export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** The fields of an issue the edit form changes. */
export interface IssueDraft {
  readonly title: string;
  readonly body: string;
  readonly milestoneNumber: number | null;
  /** YYYY-MM-DD, or null for none. */
  readonly dueDate: string | null;
}

export function issueDraft(issue: Pick<IssueDetail, 'title' | 'body' | 'milestone' | 'dueDate'>): IssueDraft {
  return { title: issue.title, body: issue.body ?? '', milestoneNumber: issue.milestone?.number ?? null, dueDate: issue.dueDate };
}

/** The PATCH body: only what changed, with the version the edit started from. Null when nothing changed. */
export function issuePatch(current: IssueDraft, draft: IssueDraft, expectedVersion: number): UpdateIssueInput | null {
  const changes: Omit<UpdateIssueInput, 'expectedVersion'> = {
    ...(draft.title !== current.title ? { title: draft.title } : {}),
    ...(draft.body !== current.body ? { body: draft.body } : {}),
    ...(draft.milestoneNumber !== current.milestoneNumber ? { milestoneNumber: draft.milestoneNumber } : {}),
    ...(draft.dueDate !== current.dueDate ? { dueDate: draft.dueDate } : {}),
  };
  return Object.keys(changes).length === 0 ? null : { expectedVersion, ...changes };
}

/** Names to add and to remove to turn the labels an item has into the ones picked. */
export function labelChanges(current: readonly string[], picked: readonly string[]): { readonly add: string[]; readonly remove: string[] } {
  const had = new Set(current);
  const want = new Set(picked);
  return { add: [...want].filter((name) => !had.has(name)), remove: [...had].filter((name) => !want.has(name)) };
}

export function commentsErrorText(error: NonNullable<IssueDetail['commentsError']>): string {
  switch (error) {
    case 'github_not_configured':
      return 'The portal is not connected to GitHub, so comments cannot be shown.';
    case 'github_rate_limited':
      return 'GitHub is limiting requests right now. Try again in a minute.';
    default:
      return 'GitHub did not answer, so comments cannot be shown right now.';
  }
}

export interface RepositoryProblem {
  readonly key: string;
  readonly tone: 'warning' | 'error';
  readonly text: string;
}

/** What is wrong with the repositories a project reads from, worst first. */
export function repositoryProblems(
  repositories: ReadonlyArray<Pick<ProjectRepository, 'id' | 'fullName' | 'archived' | 'removed' | 'syncStatus'>>,
): RepositoryProblem[] {
  const problems: RepositoryProblem[] = [];
  for (const repository of repositories) {
    if (repository.removed) {
      problems.push({ key: `${repository.id}:removed`, tone: 'error', text: `The portal lost access to ${repository.fullName}. Its items stay visible but cannot be changed.` });
      continue;
    }
    if (repository.archived) problems.push({ key: `${repository.id}:archived`, tone: 'warning', text: `${repository.fullName} is archived on GitHub, so its items are read-only.` });
    if (repository.syncStatus === 'failed') problems.push({ key: `${repository.id}:failed`, tone: 'warning', text: `The last sync of ${repository.fullName} failed, so it may be out of date.` });
  }
  return problems.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'error' ? -1 : 1));
}

/** Writes need a repository the App can still reach and GitHub still accepts changes for. */
export function canWriteTo(repository: Pick<RepositoryRef, 'archived' | 'removed'> | undefined): boolean {
  return repository !== undefined && !repository.archived && !repository.removed;
}

/** Items closed in the last `days` days of a milestone's daily series. */
export function recentlyClosed(progress: Pick<MilestoneProgress, 'closedByDay'>, days = 7): number {
  return progress.closedByDay.slice(-days).reduce((sum, day) => sum + day.closed, 0);
}

export function milestonePercent(open: number, closed: number): number {
  const total = open + closed;
  return total === 0 ? 0 : Math.round((closed / total) * 100);
}

/** `repo#12` for an activity row's item id (`<repository id>-<number>`); `#12` when the repository is not in the list. */
export function activityRef(issueId: string | null, repositories: ReadonlyArray<{ readonly id: number; readonly fullName: string }>): string | null {
  if (!issueId) return null;
  const dash = issueId.lastIndexOf('-');
  if (dash === -1) return null;
  const repository = repositories.find((candidate) => String(candidate.id) === issueId.slice(0, dash));
  const number = issueId.slice(dash + 1);
  return repository ? `${repoName(repository.fullName)}#${number}` : `#${number}`;
}
