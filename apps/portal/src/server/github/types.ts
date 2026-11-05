/**
 * Shared contract of the GitHub integration (design: .omo/waves/gh-core/design.md).
 *
 * Pure on purpose: constants, one id helper and types, no runtime imports.
 * db/schema/github.ts takes its enum arrays from here (as the mailbox schema
 * does), and Worker code, `node --test` unit tests and the SPA import it too.
 * Pure modules import it as `../types.ts` so Node's type stripping can load them.
 */

/** The only GitHub organisation whose App installation is accepted (compared case-insensitively). */
export const GITHUB_ORG = '180DC-VIT-CHENNAI';
export const GITHUB_API_URL = 'https://api.github.com';
/** OAuth authorize and token endpoints live on the web host, not the API host. */
export const GITHUB_WEB_URL = 'https://github.com';
export const GITHUB_API_VERSION = '2022-11-28';
export const GITHUB_USER_AGENT = '180dc-portal';

/** Repository permissions the App is registered with; the admin status page lists any an installation lacks. */
export const GITHUB_APP_PERMISSIONS = {
  metadata: 'read',
  issues: 'write',
  pull_requests: 'read',
  checks: 'read',
  statuses: 'read',
} as const;

/** Ticked under "Subscribe to events". installation, installation_repositories and github_app_authorization always reach an App. */
export const GITHUB_SUBSCRIBED_EVENTS = [
  'issues', 'issue_comment', 'label', 'milestone', 'pull_request', 'pull_request_review', 'check_run', 'status', 'repository',
] as const;

/** Every event the webhook acts on; any other event is recorded as ignored (`unhandled_event`). */
export const HANDLED_WEBHOOK_EVENTS = [
  'ping', 'installation', 'installation_repositories', 'github_app_authorization', ...GITHUB_SUBSCRIBED_EVENTS,
] as const;
export type HandledWebhookEvent = (typeof HANDLED_WEBHOOK_EVENTS)[number];

export const GITHUB_LIMITS = {
  /** Larger webhook bodies get 413 before any other work. */
  webhookBodyBytes: 2 * 1024 * 1024,
  /** GitHub REST calls one sync run (a cron tick or one "Sync now") may make, token requests included. */
  syncCallsPerRun: 30,
  perPage: 100,
  boardItems: 500,
  /** Closed items appear in the Done column for this many days after closing. */
  doneColumnDays: 14,
  /** A full backfill reads open items plus closed ones updated within this window. */
  fullBackfillDays: 90,
  /** An idle mapped repository is resynced when its last pass is older than this. */
  resyncAfterHours: 6,
  /** Incremental passes read from this long before the last pass started. */
  incrementalOverlapMinutes: 5,
  /** A failed repository waits this long per consecutive failure before the cron retries it. */
  syncFailureBackoffMinutes: 30,
  /** Unmapped repositories whose leftover data one cron run purges. */
  purgesPerRun: 5,
  /** A `processing` ledger row claimed longer ago than this may be claimed again. */
  deliveryReclaimMinutes: 5,
  /** A `pending` create older than this is treated as outcome_unknown. */
  writeRequestPendingMinutes: 2,
  mentionsPerItem: 10,
  /** Installations' repository lists are refreshed at least this often. */
  repoListRefreshHours: 24,
  oauthStateMinutes: 10,
  /** Refresh a user token when it expires within this many minutes. */
  userTokenRefreshMinutes: 5,
  requestTimeoutMs: 10_000,
  titleLength: 256,
  /** GitHub allows 65,536 characters; the margin leaves room for the App attribution footer. */
  bodyLength: 65_000,
  labelsPerIssue: 20,
  labelNameLength: 50,
  assigneesPerIssue: 10,
  activityPerIssue: 50,
} as const;

export const GITHUB_RETENTION_DAYS = {
  deliveries: 30,
  writeRequests: 7,
  activity: 90,
  readNotifications: 90,
  staleChecks: 30,
} as const;

export const INSTALLATION_ACCOUNT_TYPES = ['Organization', 'User'] as const;
export const REPOSITORY_SELECTIONS = ['all', 'selected'] as const;
/** queued = waiting for a pass; running = a pass is part-way (see `sync_cursor`). */
export const REPO_SYNC_STATUSES = ['idle', 'queued', 'running', 'failed'] as const;
export const REPO_SYNC_MODES = ['full', 'incremental'] as const;
/** In order. Incremental passes skip open_issues; see design.md section 11.2 for each phase's GitHub call. */
export const SYNC_PHASES = ['labels', 'milestones', 'open_issues', 'recent_issues', 'pulls', 'reviews', 'checks'] as const;
export const ITEM_KINDS = ['issue', 'pull'] as const;
export const ITEM_STATES = ['open', 'closed'] as const;
export const MILESTONE_STATES = ['open', 'closed'] as const;
export const PARTICIPANT_ROLES = ['assignee', 'reviewer'] as const;
/** Lower-cased: webhooks send `approved`, the REST API `APPROVED`. PENDING reviews are never stored. */
export const REVIEW_STATES = ['approved', 'changes_requested', 'commented', 'dismissed'] as const;
export const REVIEW_DECISIONS = ['none', 'review_required', 'approved', 'changes_requested'] as const;
export const CHECK_STATUSES = ['none', 'pending', 'success', 'failure'] as const;
export const COMMIT_CHECK_SOURCES = ['check_run', 'status'] as const;
/** pending covers queued, in_progress, waiting, requested and a pending commit status. */
export const COMMIT_CHECK_STATES = ['pending', 'completed'] as const;
/** Completed conclusions that do not fail a pull request; every other conclusion is a failure. */
export const PASSING_CONCLUSIONS = ['success', 'neutral', 'skipped'] as const;
export const ACCOUNT_LINK_METHODS = ['oauth', 'admin'] as const;
export const USER_TOKEN_STATES = ['active', 'revoked'] as const;
export const DELIVERY_STATUSES = ['processing', 'processed', 'ignored', 'failed'] as const;
export const WRITE_REQUEST_KINDS = ['issue', 'comment'] as const;
export const WRITE_REQUEST_STATUSES = ['pending', 'done', 'failed', 'outcome_unknown'] as const;
export const GITHUB_NOTIFICATION_KINDS = ['assigned', 'review_requested', 'review_submitted', 'mentioned'] as const;
export const ACTIVITY_KINDS = [
  'opened', 'closed', 'reopened', 'merged', 'assigned', 'unassigned', 'labeled', 'unlabeled',
  'milestoned', 'demilestoned', 'commented', 'review_requested', 'reviewed', 'ready_for_review', 'converted_to_draft',
] as const;

export type InstallationAccountType = (typeof INSTALLATION_ACCOUNT_TYPES)[number];
export type RepositorySelection = (typeof REPOSITORY_SELECTIONS)[number];
export type RepoSyncStatus = (typeof REPO_SYNC_STATUSES)[number];
export type RepoSyncMode = (typeof REPO_SYNC_MODES)[number];
export type SyncPhase = (typeof SYNC_PHASES)[number];
export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemState = (typeof ITEM_STATES)[number];
export type MilestoneState = (typeof MILESTONE_STATES)[number];
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
export type ReviewState = (typeof REVIEW_STATES)[number];
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export type CheckStatus = (typeof CHECK_STATUSES)[number];
export type CommitCheckSource = (typeof COMMIT_CHECK_SOURCES)[number];
export type CommitCheckState = (typeof COMMIT_CHECK_STATES)[number];
export type AccountLinkMethod = (typeof ACCOUNT_LINK_METHODS)[number];
export type UserTokenState = (typeof USER_TOKEN_STATES)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type WriteRequestKind = (typeof WRITE_REQUEST_KINDS)[number];
export type WriteRequestStatus = (typeof WRITE_REQUEST_STATUSES)[number];
export type GitHubNotificationKind = (typeof GITHUB_NOTIFICATION_KINDS)[number];
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Portal id of an issue or pull request: `<repository id>-<number>`, the same for both GitHub representations of a PR. */
export function issueKey(repositoryId: number, number: number): string {
  return `${repositoryId}-${number}`;
}

/** Latest review per reviewer (`github_issues.reviews`). */
export interface StoredReview {
  readonly githubUserId: number;
  readonly login: string;
  readonly state: ReviewState;
  readonly submittedAt: string | null;
}

/** Where a repository's sync pass stopped (`github_repositories.sync_cursor`). */
export interface SyncCursor {
  readonly phase: SyncPhase;
  /** Next page to read in a paged phase (1-based). */
  readonly page: number;
  /** ISO time passed to GitHub as `since` (or used as the stop mark for pulls); null reads everything. */
  readonly since: string | null;
  /** reviews/checks phases: the last open pull request number handled. */
  readonly afterNumber: number | null;
}

/** `github_activity.detail`: only the fields its kind needs. */
export interface ActivityDetail {
  readonly label?: string;
  readonly assigneeLogin?: string;
  readonly reviewerLogin?: string;
  readonly milestone?: string;
  readonly reviewState?: ReviewState;
  readonly commentId?: number;
}

/** `github_write_requests.result` once a create succeeded. */
export interface WriteRequestResult {
  readonly issueId: string;
  readonly number: number;
  readonly htmlUrl: string;
  readonly commentId: number | null;
}

export const BOARD_COLUMNS = ['backlog', 'todo', 'in_progress', 'in_review', 'done'] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const BOARD_COLUMN_TITLES = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
} as const satisfies Record<BoardColumn, string>;

/** Columns an open item reaches through a status label. Backlog means no status label; Done means closed. */
export const LABELLED_COLUMNS = ['todo', 'in_progress', 'in_review'] as const;
export type LabelledColumn = (typeof LABELLED_COLUMNS)[number];

/** The label the portal adds for each column, created in the repository when missing. Colours are GitHub hex without '#'. */
export const STATUS_LABELS = {
  todo: { name: 'status: todo', color: 'c5def5', description: 'Planned (portal board: To do)' },
  in_progress: { name: 'status: in progress', color: 'fbca04', description: 'Being worked on (portal board: In progress)' },
  in_review: { name: 'status: in review', color: '5319e7', description: 'Waiting for review (portal board: In review)' },
} as const satisfies Record<LabelledColumn, { readonly name: string; readonly color: string; readonly description: string }>;

/**
 * Label names read as a status, in normalised form: lower-cased, every run of
 * characters other than a-z and 0-9 replaced by one space, trimmed
 * ("Status: In-Progress" -> "status in progress"). When several match, the
 * furthest column wins (in_review > in_progress > todo).
 */
export const STATUS_LABEL_ALIASES = {
  todo: ['status todo', 'status to do', 'todo', 'to do'],
  in_progress: ['status in progress', 'status doing', 'in progress', 'doing', 'wip'],
  in_review: ['status in review', 'status review', 'in review', 'needs review'],
} as const satisfies Record<LabelledColumn, readonly string[]>;

/** Codes the GitHub routes send as the plain-text error body (read by `toProblem` in src/lib/errors.ts). */
export const GITHUB_ERROR_CODES = [
  'github_not_configured', 'linking_not_configured', 'github_unavailable', 'github_rate_limited', 'github_app_forbidden',
  'github_validation_failed', 'github_outcome_unknown', 'github_conflict', 'issues_disabled', 'repository_archived',
  'installation_suspended', 'issue_not_found', 'repository_not_found', 'repository_not_mapped', 'issue_changed',
  'pull_request_read_only', 'use_column_endpoint', 'person_not_found', 'person_not_linked', 'assignee_cannot_see_project',
  'too_many_assignees', 'unknown_milestone', 'github_account_taken', 'github_user_not_found', 'request_in_progress',
  'request_id_reused', 'request_outcome_unknown', 'unknown_label', 'invalid_signature', 'missing_delivery_headers',
  'payload_too_large', 'payload_invalid', 'webhook_failed',
] as const;
export type GitHubErrorCode = (typeof GITHUB_ERROR_CODES)[number];

/** Why GitHub configuration present in the environment cannot be used (shown on the admin status page). */
export const GITHUB_CONFIG_ERRORS = ['app_id_invalid', 'private_key_not_pkcs8', 'private_key_invalid', 'token_key_invalid'] as const;
export type GitHubConfigError = (typeof GITHUB_CONFIG_ERRORS)[number];

/** Values of `?github=` on the profile page after the OAuth callback. */
export const LINK_RESULTS = ['linked', 'denied', 'state_invalid', 'exchange_failed', 'taken', 'not_configured'] as const;
export type LinkResult = (typeof LINK_RESULTS)[number];

/** What the client calls instead of the global fetch; unit tests pass fixture functions. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Parsed environment (src/server/github/config.ts). A null part disables what depends on it. */
export interface GitHubSettings {
  /** GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY (PKCS#8 PEM with real newlines restored). */
  readonly app: { readonly appId: string; readonly privateKeyPem: string } | null;
  /** GITHUB_WEBHOOK_SECRET. */
  readonly webhookSecret: string | null;
  /** GITHUB_APP_CLIENT_ID + GITHUB_APP_CLIENT_SECRET: account linking. */
  readonly oauth: { readonly clientId: string; readonly clientSecret: string } | null;
  /** GITHUB_TOKEN_ENCRYPTION_KEY (base64 of 32 bytes): storing user tokens for user-attributed writes. */
  readonly tokenEncryptionKey: string | null;
  /** The GITHUB_API_URL constant; GITHUB_TEST_API_URL replaces it outside production builds. */
  readonly apiUrl: string;
  /** The GITHUB_WEB_URL constant; GITHUB_TEST_API_URL replaces it too outside production builds (the fixture server serves both). */
  readonly webUrl: string;
  readonly configError: GitHubConfigError | null;
}

/** The credential a request is sent with. */
export type GitHubAuth =
  | { readonly kind: 'app' }
  | { readonly kind: 'installation'; readonly installationId: number }
  | { readonly kind: 'user'; readonly token: string };

export interface GitHubRequest {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Path below the API URL, already expanded, starting with '/'. */
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly body?: unknown;
  readonly accept?: string;
}

export interface GitHubRateLimit {
  readonly limit: number | null;
  readonly remaining: number | null;
  /** ISO time from x-ratelimit-reset. */
  readonly resetAt: string | null;
}

export interface GitHubResponse<T> {
  readonly status: number;
  readonly data: T;
  readonly rateLimit: GitHubRateLimit;
  /** From the Link header's rel="next"; null on the last page. */
  readonly nextPage: number | null;
}

export const GITHUB_ERROR_KINDS = [
  'unauthorized', 'forbidden', 'not_found', 'gone', 'conflict', 'validation', 'rate_limited', 'unavailable', 'network', 'timeout',
] as const;
export type GitHubErrorKind = (typeof GITHUB_ERROR_KINDS)[number];

/** Carried by the GitHubError class thrown by src/server/github/client.ts. */
export interface GitHubErrorInfo {
  readonly kind: GitHubErrorKind;
  /** HTTP status from GitHub; null for network errors and timeouts. */
  readonly status: number | null;
  readonly message: string;
  readonly retryAfterSeconds: number | null;
  readonly documentationUrl: string | null;
}

export interface GitHubClient {
  request<T>(auth: GitHubAuth, request: GitHubRequest): Promise<GitHubResponse<T>>;
  /** Reads up to `maxPages` pages from `startPage`; `itemsKey` unwraps lists GitHub nests in an object. */
  paginate<T>(
    auth: GitHubAuth,
    request: GitHubRequest & { readonly maxPages: number; readonly startPage?: number; readonly itemsKey?: string },
  ): Promise<{ readonly items: T[]; readonly nextPage: number | null; readonly calls: number; readonly rateLimit: GitHubRateLimit }>;
}

export interface GitHubClientOptions {
  readonly fetch: FetchLike;
  readonly apiUrl: string;
  /** Mints app JWTs and installation tokens for the `app` and `installation` auth kinds. */
  readonly tokens: {
    appJwt(): Promise<string>;
    installationToken(installationId: number): Promise<string>;
  };
  readonly timeoutMs?: number;
}

/** What GitHub's OAuth token endpoint granted. Expiries are ISO times; null when the App does not expire user tokens. */
export interface UserTokenGrant {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string | null;
  readonly refreshToken: string | null;
  readonly refreshTokenExpiresAt: string | null;
}

/** Who a write went out as (returned by every write route). */
export const FALLBACK_REASONS = ['not_linked', 'no_token', 'token_revoked', 'user_forbidden'] as const;
export type FallbackReason = (typeof FALLBACK_REASONS)[number];

export interface Attribution {
  readonly mode: 'user' | 'app';
  /** The GitHub login the write appears under for mode 'user'; null for the App. */
  readonly login: string | null;
  readonly fallbackReason: FallbackReason | null;
  /** On a user-mode create: fields GitHub dropped (no push access) that the App then set. */
  readonly appliedAsApp: readonly ('labels' | 'assignees' | 'milestone')[];
}

export interface GhUser {
  readonly id: number;
  readonly login: string;
  readonly type?: string;
}

export interface GhLabel {
  readonly id: number;
  readonly name: string;
  readonly color: string;
  readonly description?: string | null;
}

export interface GhMilestone {
  readonly id: number;
  readonly number: number;
  readonly title: string;
  readonly description?: string | null;
  readonly state: MilestoneState;
  readonly due_on: string | null;
  readonly open_issues: number;
  readonly closed_issues: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at: string | null;
}

/** Full objects come from the REST API and repository events; installation payloads carry only id, name, full_name and private. */
export interface GhRepository {
  readonly id: number;
  readonly name: string;
  readonly full_name: string;
  readonly private: boolean;
  readonly owner?: GhUser;
  readonly archived?: boolean;
  readonly default_branch?: string;
}

export interface GhInstallation {
  readonly id: number;
  readonly account: GhUser | null;
  readonly repository_selection: RepositorySelection;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly events?: readonly string[];
  readonly suspended_at?: string | null;
}

/** The issues API returns pull requests too, marked by `pull_request`. */
export interface GhIssue {
  readonly id: number;
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly state: ItemState;
  readonly state_reason?: string | null;
  readonly html_url: string;
  readonly user: GhUser | null;
  readonly assignees?: readonly GhUser[];
  readonly labels: readonly GhLabel[];
  readonly milestone: GhMilestone | null;
  readonly comments: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at: string | null;
  readonly pull_request?: { readonly merged_at?: string | null };
}

export interface GhPullRequest {
  readonly id: number;
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly state: ItemState;
  readonly html_url: string;
  readonly user: GhUser | null;
  readonly assignees?: readonly GhUser[];
  readonly requested_reviewers?: readonly GhUser[];
  readonly labels: readonly GhLabel[];
  readonly milestone: GhMilestone | null;
  readonly draft?: boolean;
  readonly merged?: boolean;
  readonly merged_at: string | null;
  readonly head: { readonly ref: string; readonly sha: string };
  readonly base: { readonly ref: string; readonly repo: { readonly id: number } };
  readonly comments?: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at: string | null;
}

export interface GhReview {
  readonly id: number;
  readonly user: GhUser | null;
  /** Either case; lower-case before storing. */
  readonly state: string;
  readonly submitted_at?: string | null;
}

export interface GhCheckRun {
  readonly id: number;
  readonly name: string;
  readonly head_sha: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly details_url?: string | null;
  readonly html_url?: string | null;
  readonly app?: { readonly id: number } | null;
}

export interface GhComment {
  readonly id: number;
  readonly user: GhUser | null;
  readonly body: string;
  readonly html_url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface WebhookEnvelope {
  readonly action?: string;
  readonly installation?: { readonly id: number };
  readonly repository?: GhRepository;
  readonly organization?: { readonly id: number; readonly login: string };
  readonly sender?: GhUser;
}

/** Body per handled event (`X-GitHub-Event`). */
export interface WebhookPayloads {
  ping: WebhookEnvelope & { readonly zen?: string; readonly hook_id?: number };
  installation: WebhookEnvelope & { readonly installation: GhInstallation; readonly repositories?: readonly GhRepository[] };
  installation_repositories: WebhookEnvelope & {
    readonly installation: GhInstallation;
    readonly repositories_added: readonly GhRepository[];
    readonly repositories_removed: readonly GhRepository[];
  };
  github_app_authorization: WebhookEnvelope & { readonly sender: GhUser };
  repository: WebhookEnvelope & { readonly repository: GhRepository };
  issues: WebhookEnvelope & {
    readonly repository: GhRepository;
    readonly issue: GhIssue;
    readonly assignee?: GhUser | null;
    readonly label?: GhLabel;
    readonly changes?: { readonly new_repository?: GhRepository; readonly new_issue?: GhIssue };
  };
  issue_comment: WebhookEnvelope & { readonly repository: GhRepository; readonly issue: GhIssue; readonly comment: GhComment };
  label: WebhookEnvelope & { readonly repository: GhRepository; readonly label: GhLabel };
  milestone: WebhookEnvelope & { readonly repository: GhRepository; readonly milestone: GhMilestone };
  pull_request: WebhookEnvelope & {
    readonly repository: GhRepository;
    readonly number: number;
    readonly pull_request: GhPullRequest;
    readonly requested_reviewer?: GhUser;
    readonly assignee?: GhUser;
    readonly label?: GhLabel;
  };
  pull_request_review: WebhookEnvelope & { readonly repository: GhRepository; readonly review: GhReview; readonly pull_request: GhPullRequest };
  check_run: WebhookEnvelope & { readonly repository: GhRepository; readonly check_run: GhCheckRun };
  status: WebhookEnvelope & {
    readonly repository: GhRepository;
    readonly id: number;
    readonly sha: string;
    readonly context: string;
    readonly state: 'error' | 'failure' | 'pending' | 'success';
    readonly target_url: string | null;
    readonly updated_at: string;
  };
}

export const IGNORE_REASONS = [
  'unhandled_event', 'ping', 'foreign_installation', 'unknown_installation', 'unknown_repository', 'unmapped_repository', 'stale',
] as const;
export type IgnoreReason = (typeof IGNORE_REASONS)[number];

/** What a webhook handler reports; the ledger row takes `processed` or `ignored` (with the reason in `detail`). */
export type WebhookOutcome = { readonly status: 'processed' } | { readonly status: 'ignored'; readonly reason: IgnoreReason };

export interface WebhookDelivery<E extends HandledWebhookEvent = HandledWebhookEvent> {
  /** X-GitHub-Delivery. */
  readonly id: string;
  readonly event: E;
  readonly payload: WebhookPayloads[E];
}

/** Body of every 2xx webhook response. */
export interface WebhookResponse {
  readonly ok: true;
  readonly status: Exclude<DeliveryStatus, 'processing'> | 'duplicate';
  readonly reason?: IgnoreReason;
}

/** Which writer applied a GitHub object to D1; webhook applies also write activity and notices. */
export type ApplySource = 'webhook' | 'sync' | 'write';

export interface ApplyContext {
  readonly source: ApplySource;
  /** X-GitHub-Delivery for webhook applies: the dedupe key of activity rows and notices. */
  readonly deliveryId: string | null;
  readonly action: string | null;
  /** The GitHub user who caused the event; never notified about their own action. */
  readonly sender: GhUser | null;
}

export interface SyncStepResult {
  readonly repositoryId: number;
  readonly status: RepoSyncStatus;
  readonly cursor: SyncCursor | null;
  readonly calls: number;
  readonly upserted: number;
  readonly error: string | null;
}

export interface SyncRunSummary {
  readonly installationsRefreshed: number;
  readonly repositories: readonly SyncStepResult[];
  readonly purgedRepositories: number;
  readonly pruned: Readonly<Record<keyof typeof GITHUB_RETENTION_DAYS | 'oauthStates', number>>;
}

export interface PersonRef {
  readonly id: string;
  readonly fullName: string;
  readonly photoKey: string | null;
}

/** A GitHub user; `person` is set when the numeric id is linked to a portal person. */
export interface GitHubUserRef {
  readonly githubUserId: number;
  readonly login: string;
  readonly person: PersonRef | null;
}

export interface LabelView {
  readonly id: number;
  readonly name: string;
  readonly color: string;
  /** The column this label stands for, if it is a status label. */
  readonly status: LabelledColumn | null;
}

export interface MilestoneView {
  readonly id: number;
  readonly number: number;
  readonly title: string;
  readonly state: MilestoneState;
  /** YYYY-MM-DD. */
  readonly dueOn: string | null;
}

export interface RepositoryRef {
  readonly id: number;
  readonly fullName: string;
  readonly htmlUrl: string;
  readonly private: boolean;
  readonly archived: boolean;
  /** The App lost access (uninstalled, removed from the installation, deleted or transferred). */
  readonly removed: boolean;
}

/** Pull-request-only facts. */
export interface PullFacts {
  readonly draft: boolean;
  readonly merged: boolean;
  readonly mergedAt: string | null;
  readonly headRef: string | null;
  readonly baseRef: string | null;
  readonly checkStatus: CheckStatus;
  readonly reviewDecision: ReviewDecision;
  readonly requestedReviewers: readonly GitHubUserRef[];
  readonly reviews: readonly (StoredReview & { readonly person: PersonRef | null })[];
}

/** The other end of a closing reference; `id` is null when that item is not synced. */
export interface LinkedItemRef {
  readonly id: string | null;
  readonly repositoryFullName: string | null;
  readonly number: number;
  readonly kind: ItemKind;
  readonly title: string | null;
  readonly state: ItemState | null;
  readonly merged: boolean;
  readonly checkStatus: CheckStatus;
  readonly htmlUrl: string | null;
}

export interface IssueCard {
  /** issueKey(repositoryId, number). */
  readonly id: string;
  readonly kind: ItemKind;
  readonly repository: { readonly id: number; readonly fullName: string };
  readonly number: number;
  readonly title: string;
  readonly state: ItemState;
  readonly stateReason: string | null;
  readonly column: BoardColumn;
  readonly htmlUrl: string;
  readonly author: GitHubUserRef | null;
  readonly assignees: readonly GitHubUserRef[];
  readonly labels: readonly LabelView[];
  readonly milestone: MilestoneView | null;
  /** Portal-only due date (YYYY-MM-DD). */
  readonly dueDate: string | null;
  /** dueDate, else the milestone's due date. */
  readonly effectiveDueDate: string | null;
  readonly overdue: boolean;
  readonly commentCount: number;
  /** Issues: pull requests that close it. Pull requests: issues it closes. */
  readonly links: readonly LinkedItemRef[];
  readonly pull: PullFacts | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt: string | null;
  readonly version: number;
}

export interface ProjectRef {
  readonly id: string;
  readonly name: string;
}

export interface CommentView {
  readonly id: number;
  readonly author: GitHubUserRef | null;
  readonly body: string;
  readonly htmlUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CheckView {
  readonly source: CommitCheckSource;
  readonly name: string;
  readonly state: CommitCheckState;
  readonly conclusion: string | null;
  readonly detailsUrl: string | null;
}

export interface ActivityView {
  readonly id: number;
  readonly kind: ActivityKind;
  readonly issueId: string | null;
  readonly actor: GitHubUserRef | null;
  readonly detail: ActivityDetail;
  readonly occurredAt: string;
}

/** GET /api/github/issues/:id */
export interface IssueDetail extends IssueCard {
  readonly body: string | null;
  readonly project: ProjectRef;
  readonly access: { readonly write: boolean };
  /** Pull requests: checks on the head commit. */
  readonly checks: readonly CheckView[];
  /** Newest first. */
  readonly activity: readonly ActivityView[];
  /** Read live from GitHub; null when that failed (see commentsError). */
  readonly comments: readonly CommentView[] | null;
  readonly commentsError: 'github_not_configured' | 'github_unavailable' | 'github_rate_limited' | null;
}

export interface ProjectRepository extends RepositoryRef {
  readonly labels: readonly LabelView[];
  /** Open milestones and those closed within the last 90 days. */
  readonly milestones: readonly MilestoneView[];
  readonly syncStatus: RepoSyncStatus;
  readonly lastSyncedAt: string | null;
}

/** GET /api/github/projects/:id */
export interface ProjectGitHubResponse {
  readonly configured: boolean;
  readonly repositories: readonly ProjectRepository[];
  readonly access: { readonly write: boolean };
  /** Linked people who can see the project: the assignee picker. */
  readonly assignable: readonly GitHubUserRef[];
}

export interface BoardColumnView {
  readonly key: BoardColumn;
  readonly title: string;
  readonly items: readonly IssueCard[];
}

/** GET /api/github/projects/:id/board */
export interface BoardResponse {
  readonly columns: readonly BoardColumnView[];
  /** More than GITHUB_LIMITS.boardItems matched; narrow the filters. */
  readonly truncated: boolean;
}

/** GET /api/github/projects/:id/pulls */
export interface PullsResponse {
  readonly pulls: readonly IssueCard[];
}

export interface MilestoneProgress {
  readonly repositoryId: number;
  readonly milestone: MilestoneView;
  readonly open: number;
  readonly closed: number;
  /** Items of the milestone closed per UTC day, from the milestone's creation (or 30 days back) to today. */
  readonly closedByDay: readonly { readonly date: string; readonly closed: number }[];
}

/** GET /api/github/projects/:id/milestones */
export interface MilestonesResponse {
  readonly milestones: readonly MilestoneProgress[];
}

/** GET /api/github/projects/:id/activity */
export interface ActivityResponse {
  readonly activity: readonly ActivityView[];
  readonly nextBefore: number | null;
}

export interface MyWorkItem extends IssueCard {
  readonly project: ProjectRef;
}

/** GET /api/github/my-work */
export interface MyWorkResponse {
  readonly linked: boolean;
  readonly login: string | null;
  /** Open issues and pull requests assigned to me. */
  readonly assigned: readonly MyWorkItem[];
  /** Open pull requests waiting for my review. */
  readonly reviewRequested: readonly MyWorkItem[];
  /** My open pull requests. */
  readonly authored: readonly MyWorkItem[];
  /** Assigned to me, open, effective due date before today. */
  readonly overdue: readonly MyWorkItem[];
}

/** POST /api/github/projects/:id/issues and every issue write route. */
export interface IssueWriteResponse {
  readonly item: IssueCard;
  readonly attribution: Attribution;
  /** Logins GitHub did not assign (no access to the repository). */
  readonly ignoredAssignees: readonly string[];
  /** True when a create was answered from its earlier, successful request. */
  readonly replayed: boolean;
}

/** POST /api/github/issues/:id/comments */
export interface CommentWriteResponse {
  readonly comment: CommentView;
  readonly attribution: Attribution;
  readonly replayed: boolean;
}

export interface GitHubNoticeView {
  readonly id: number;
  readonly kind: GitHubNotificationKind;
  readonly item: { readonly id: string; readonly kind: ItemKind; readonly number: number; readonly title: string; readonly repositoryFullName: string };
  readonly project: ProjectRef;
  readonly actor: GitHubUserRef | null;
  readonly createdAt: string;
  readonly readAt: string | null;
}

/** GET /api/github/notifications */
export interface GitHubNoticesResponse {
  readonly notices: readonly GitHubNoticeView[];
  readonly unread: number;
}

/** GET /api/github/me */
export interface GitHubMeResponse {
  readonly configured: boolean;
  readonly linkingAvailable: boolean;
  readonly userTokensAvailable: boolean;
  readonly account: {
    readonly githubUserId: number;
    readonly login: string;
    readonly method: AccountLinkMethod;
    readonly linkedAt: string;
    readonly tokenState: UserTokenState | 'none';
    /** Writes go out under this account. */
    readonly actsAsYou: boolean;
  } | null;
}

/** POST /api/github/link */
export interface LinkStartResponse {
  readonly url: string;
}

export interface InstallationView {
  readonly id: number;
  readonly accountLogin: string;
  readonly repositorySelection: RepositorySelection;
  readonly suspendedAt: string | null;
  readonly deletedAt: string | null;
  readonly reposSyncedAt: string | null;
  /** Keys of GITHUB_APP_PERMISSIONS the installation has not granted at the needed level. */
  readonly missingPermissions: readonly string[];
}

/** GET /api/github/status and POST /api/github/installations/sync */
export interface GitHubStatusResponse {
  readonly org: string;
  readonly configured: { readonly app: boolean; readonly webhook: boolean; readonly linking: boolean; readonly userTokens: boolean };
  readonly configError: GitHubConfigError | null;
  readonly installations: readonly InstallationView[];
  readonly repositories: { readonly total: number; readonly mapped: number; readonly failing: number };
  readonly deliveries: { readonly lastReceivedAt: string | null; readonly failedLast24h: number };
}

export interface RepositoryAdminRow extends RepositoryRef {
  readonly installationId: number;
  readonly defaultBranch: string | null;
  readonly project: ProjectRef | null;
  readonly syncStatus: RepoSyncStatus;
  readonly syncMode: RepoSyncMode;
  readonly lastSyncedAt: string | null;
  readonly lastSyncError: string | null;
  readonly itemCount: number;
}

/** GET /api/github/repositories; PUT .../project and POST .../sync return one row. */
export interface RepositoriesResponse {
  readonly repositories: readonly RepositoryAdminRow[];
}

export interface DeliveryRow {
  readonly id: string;
  readonly event: string;
  readonly action: string | null;
  readonly repositoryId: number | null;
  readonly status: DeliveryStatus;
  readonly detail: string | null;
  readonly attempts: number;
  readonly receivedAt: string;
  readonly processedAt: string | null;
}

/** GET /api/github/deliveries */
export interface DeliveriesResponse {
  readonly deliveries: readonly DeliveryRow[];
  readonly nextCursor: string | null;
}

export interface AccountPerson extends PersonRef {
  readonly email: string;
  readonly status: string;
}

export interface AccountLinkView {
  readonly person: AccountPerson;
  readonly githubUserId: number;
  readonly login: string;
  readonly method: AccountLinkMethod;
  readonly verified: boolean;
  readonly linkedAt: string;
  readonly tokenState: UserTokenState | 'none';
}

/** GET /api/github/accounts; PUT .../:personId returns `{ link }`. */
export interface AccountsResponse {
  readonly links: readonly AccountLinkView[];
  /** Unlinked people whose profile GitHub URL names a login. Never linked automatically. */
  readonly suggestions: readonly { readonly person: AccountPerson; readonly login: string }[];
  /** GitHub users on items in mapped repositories who are linked to nobody. */
  readonly unmatched: readonly { readonly githubUserId: number; readonly login: string; readonly openItems: number }[];
}

export interface CreateIssueInput {
  /** Client UUID, generated once per create dialog and reused on retry. */
  readonly requestId: string;
  readonly repositoryId: number;
  readonly title: string;
  readonly body?: string;
  readonly assigneePersonIds?: readonly string[];
  /** Non-status label names; the column decides the status label. */
  readonly labels?: readonly string[];
  readonly milestoneNumber?: number | null;
  readonly column?: Exclude<BoardColumn, 'done'>;
  readonly dueDate?: string | null;
}

export interface UpdateIssueInput {
  readonly expectedVersion?: number;
  readonly title?: string;
  readonly body?: string;
  readonly milestoneNumber?: number | null;
  readonly dueDate?: string | null;
}

export interface MoveIssueInput {
  readonly column: BoardColumn;
  readonly expectedVersion?: number;
}

export interface SetAssigneesInput {
  /** The complete set of portal-managed assignees; unlinked GitHub assignees are left alone. */
  readonly personIds: readonly string[];
  readonly expectedVersion?: number;
}

export interface ChangeLabelsInput {
  readonly add?: readonly string[];
  readonly remove?: readonly string[];
  readonly expectedVersion?: number;
}

export interface SetStateInput {
  readonly state: ItemState;
  readonly reason?: 'completed' | 'not_planned';
  readonly expectedVersion?: number;
}

export interface CreateCommentInput {
  readonly requestId: string;
  readonly body: string;
}

export interface MapRepositoryInput {
  readonly projectId: string | null;
}

export interface SyncRepositoryInput {
  /** Restart as a full backfill instead of continuing or running an incremental pass. */
  readonly full?: boolean;
}

export interface LinkAccountInput {
  readonly login: string;
}

/** The shape of `markReadInput` in src/server/notifications.ts: 1-50 notice ids, or everything up to the newest notice the reader has seen. */
export type MarkNoticesReadInput = { readonly ids: readonly number[] } | { readonly upTo: number };
