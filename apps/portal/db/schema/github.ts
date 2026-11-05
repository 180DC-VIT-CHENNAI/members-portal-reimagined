import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import {
  ACCOUNT_LINK_METHODS, ACTIVITY_KINDS, CHECK_STATUSES, COMMIT_CHECK_SOURCES, COMMIT_CHECK_STATES, DELIVERY_STATUSES,
  GITHUB_NOTIFICATION_KINDS, INSTALLATION_ACCOUNT_TYPES, ITEM_KINDS, ITEM_STATES, MILESTONE_STATES, PARTICIPANT_ROLES,
  REPO_SYNC_MODES, REPO_SYNC_STATUSES, REPOSITORY_SELECTIONS, REVIEW_DECISIONS, USER_TOKEN_STATES, WRITE_REQUEST_KINDS,
  WRITE_REQUEST_STATUSES,
  type ActivityDetail, type StoredReview, type SyncCursor, type WriteRequestResult,
} from '../../src/server/github/types';
import { people } from './people';
import { projects } from './projects';

/*
 * GitHub App integration (contract: .omo/waves/gh-core/design.md).
 *
 * Installations, repositories, labels, milestones and users are keyed by
 * GitHub's numeric ids. An issue or pull request is keyed by
 * issueKey(repository id, number), which both of GitHub's representations of a
 * pull request share.
 *
 * Times come in two formats; never compare across them. What the portal sets
 * in SQL (created_at, updated_at, received_at, claimed_at, processed_at,
 * mapped_at, removed_at, deleted_at, repos_synced_at, synced_at, read_at,
 * expires_at) is SQLite's 'YYYY-MM-DD HH:MM:SS' UTC. What comes from GitHub or
 * goes back to it as `since` (github_*_at, pull_updated_at, closed_at,
 * merged_at, suspended_at, occurred_at, last_synced_at, sync_pass_started_at,
 * rate_limited_until, the token expiries, reviews[].submittedAt) is ISO-8601
 * 'YYYY-MM-DDTHH:MM:SSZ'. Dates (due_date, due_on) are 'YYYY-MM-DD'.
 *
 * Never stored: installation tokens, webhook bodies, comment bodies, plaintext
 * user tokens and OAuth state values.
 */

/** One App installation. Only GITHUB_ORG's is accepted; the row stays after an uninstall. */
export const githubInstallations = sqliteTable('github_installations', {
  id: integer('id').primaryKey(),
  accountId: integer('account_id').notNull(),
  accountLogin: text('account_login').notNull(),
  accountType: text('account_type', { enum: INSTALLATION_ACCOUNT_TYPES }).notNull(),
  repositorySelection: text('repository_selection', { enum: REPOSITORY_SELECTIONS }).notNull(),
  permissions: text('permissions', { mode: 'json' }).$type<Record<string, string>>().notNull().default(sql`'{}'`),
  events: text('events', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  suspendedAt: text('suspended_at'),
  deletedAt: text('deleted_at'),
  /** Installation events carry partial repositories, so the sync job reads the full list again. */
  needsRepoSync: integer('needs_repo_sync', { mode: 'boolean' }).notNull().default(true),
  reposSyncedAt: text('repos_synced_at'),
  /** GitHub's rate-limit reset for this installation; sync skips it until then. */
  rateLimitedUntil: text('rate_limited_until'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * A repository the installation can see. `project_id` is the admin's mapping:
 * issue data is stored and shown only while it is set, and who sees it follows
 * that project. Rows are never deleted, so a re-installed App keeps mappings.
 */
export const githubRepositories = sqliteTable(
  'github_repositories',
  {
    id: integer('id').primaryKey(),
    installationId: integer('installation_id')
      .notNull()
      .references(() => githubInstallations.id),
    ownerLogin: text('owner_login').notNull(),
    name: text('name').notNull(),
    /** owner/name as GitHub reports it now; renames and transfers update it. */
    fullName: text('full_name').notNull(),
    private: integer('private', { mode: 'boolean' }).notNull().default(true),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    defaultBranch: text('default_branch'),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    mappedBy: text('mapped_by').references(() => people.id),
    mappedAt: text('mapped_at'),
    /** The App lost access: removed from the installation, uninstalled, deleted or moved out of the org. */
    removedAt: text('removed_at'),
    syncStatus: text('sync_status', { enum: REPO_SYNC_STATUSES }).notNull().default('idle'),
    syncMode: text('sync_mode', { enum: REPO_SYNC_MODES }).notNull().default('full'),
    syncCursor: text('sync_cursor', { mode: 'json' }).$type<SyncCursor>(),
    syncPassStartedAt: text('sync_pass_started_at'),
    /** Start of the last completed pass; the next incremental pass reads from here. */
    lastSyncedAt: text('last_synced_at'),
    lastSyncError: text('last_sync_error'),
    syncFailures: integer('sync_failures').notNull().default(0),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    index('github_repositories_project').on(t.projectId),
    index('github_repositories_installation').on(t.installationId),
    index('github_repositories_full_name').on(t.fullName),
  ],
);

/** Labels of mapped repositories. Names are not unique here because renames can arrive out of order. */
export const githubLabels = sqliteTable(
  'github_labels',
  {
    id: integer('id').primaryKey(),
    repositoryId: integer('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    description: text('description'),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('github_labels_repository').on(t.repositoryId, t.name)],
);

export const githubMilestones = sqliteTable(
  'github_milestones',
  {
    id: integer('id').primaryKey(),
    repositoryId: integer('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    state: text('state', { enum: MILESTONE_STATES }).notNull(),
    /** The date part of GitHub's due_on. */
    dueOn: text('due_on'),
    openIssues: integer('open_issues').notNull().default(0),
    closedIssues: integer('closed_issues').notNull().default(0),
    githubCreatedAt: text('github_created_at').notNull(),
    githubUpdatedAt: text('github_updated_at').notNull(),
    closedAt: text('closed_at'),
  },
  (t) => [uniqueIndex('github_milestones_number').on(t.repositoryId, t.number)],
);

/**
 * Issues and pull requests of mapped repositories. Common fields are applied
 * only from a representation whose updated_at is not older than
 * `github_updated_at`; pull-request fields likewise against `pull_updated_at`.
 * `version` goes up once per strictly newer change or portal-only edit, and
 * writes may send it back as expectedVersion.
 */
export const githubIssues = sqliteTable(
  'github_issues',
  {
    id: text('id').primaryKey(),
    repositoryId: integer('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    kind: text('kind', { enum: ITEM_KINDS }).notNull(),
    title: text('title').notNull(),
    /** GitHub markdown, shown as plain text; never rendered as HTML. */
    body: text('body'),
    state: text('state', { enum: ITEM_STATES }).notNull(),
    stateReason: text('state_reason'),
    htmlUrl: text('html_url').notNull(),
    authorGithubId: integer('author_github_id'),
    authorLogin: text('author_login'),
    milestoneId: integer('milestone_id').references(() => githubMilestones.id, { onDelete: 'set null' }),
    commentCount: integer('comment_count').notNull().default(0),
    /** Portal-only: GitHub issues have no due date. The milestone's due_on applies when null. */
    dueDate: text('due_date'),
    dueDateSetBy: text('due_date_set_by').references(() => people.id),
    githubCreatedAt: text('github_created_at').notNull(),
    githubUpdatedAt: text('github_updated_at').notNull(),
    closedAt: text('closed_at'),
    draft: integer('draft', { mode: 'boolean' }).notNull().default(false),
    merged: integer('merged', { mode: 'boolean' }).notNull().default(false),
    mergedAt: text('merged_at'),
    headRef: text('head_ref'),
    headSha: text('head_sha'),
    baseRef: text('base_ref'),
    pullUpdatedAt: text('pull_updated_at'),
    /** The latest review per reviewer. */
    reviews: text('reviews', { mode: 'json' }).$type<StoredReview[]>().notNull().default(sql`'[]'`),
    reviewDecision: text('review_decision', { enum: REVIEW_DECISIONS }).notNull().default('none'),
    /** Aggregate of github_commit_checks for (repository, head_sha), kept in step by the apply layer. */
    checkStatus: text('check_status', { enum: CHECK_STATUSES }).notNull().default('none'),
    version: integer('version').notNull().default(1),
    syncedAt: text('synced_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    index('github_issues_board').on(t.repositoryId, t.kind, t.state),
    index('github_issues_milestone').on(t.milestoneId),
    index('github_issues_head').on(t.repositoryId, t.headSha),
    index('github_issues_author').on(t.authorGithubId, t.state),
  ],
);

export const githubIssueLabels = sqliteTable(
  'github_issue_labels',
  {
    issueId: text('issue_id')
      .notNull()
      .references(() => githubIssues.id, { onDelete: 'cascade' }),
    labelId: integer('label_id')
      .notNull()
      .references(() => githubLabels.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.labelId] }), index('github_issue_labels_label').on(t.labelId)],
);

/** Assignees and requested reviewers by GitHub user; the portal person is resolved through github_accounts when read. */
export const githubIssueParticipants = sqliteTable(
  'github_issue_participants',
  {
    issueId: text('issue_id')
      .notNull()
      .references(() => githubIssues.id, { onDelete: 'cascade' }),
    role: text('role', { enum: PARTICIPANT_ROLES }).notNull(),
    githubUserId: integer('github_user_id').notNull(),
    login: text('login').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.issueId, t.role, t.githubUserId] }),
    index('github_issue_participants_user').on(t.githubUserId, t.role),
  ],
);

/** Closing references ("Fixes #12", "closes owner/repo#3") parsed from pull request bodies. */
export const githubIssueLinks = sqliteTable(
  'github_issue_links',
  {
    pullId: text('pull_id')
      .notNull()
      .references(() => githubIssues.id, { onDelete: 'cascade' }),
    /** issueKey of the referenced issue. No foreign key: it may not be synced yet. */
    targetId: text('target_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.pullId, t.targetId] }), index('github_issue_links_target').on(t.targetId)],
);

/** Check runs and commit statuses per commit; they can arrive before the pull request that points at the commit. */
export const githubCommitChecks = sqliteTable(
  'github_commit_checks',
  {
    repositoryId: integer('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    sha: text('sha').notNull(),
    source: text('source', { enum: COMMIT_CHECK_SOURCES }).notNull(),
    /** Check runs: `<app id>:<name>`, so a re-run replaces the earlier run. Statuses: the context. */
    checkKey: text('check_key').notNull(),
    name: text('name').notNull(),
    /** Check run or status id; an update with a lower id than the stored one is ignored. */
    externalId: integer('external_id').notNull(),
    state: text('state', { enum: COMMIT_CHECK_STATES }).notNull(),
    conclusion: text('conclusion'),
    detailsUrl: text('details_url'),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.repositoryId, t.sha, t.source, t.checkKey] })],
);

/** Webhook ledger: one row per X-GitHub-Delivery, which a GitHub redelivery reuses. */
export const githubWebhookDeliveries = sqliteTable(
  'github_webhook_deliveries',
  {
    id: text('id').primaryKey(),
    event: text('event').notNull(),
    action: text('action'),
    installationId: integer('installation_id'),
    repositoryId: integer('repository_id'),
    status: text('status', { enum: DELIVERY_STATUSES }).notNull().default('processing'),
    /** The ignore reason, or the failure (error name and message, at most 500 characters, no payload content). */
    detail: text('detail'),
    attempts: integer('attempts').notNull().default(1),
    /** SHA-256 (hex) of the verified body; the body itself is not kept. */
    payloadSha256: text('payload_sha256').notNull(),
    receivedAt: text('received_at').notNull().default(sql`(datetime('now'))`),
    /** When the current attempt took the row; a `processing` row claimed over 5 minutes ago may be taken again. */
    claimedAt: text('claimed_at').notNull().default(sql`(datetime('now'))`),
    processedAt: text('processed_at'),
  },
  (t) => [
    index('github_webhook_deliveries_status').on(t.status, t.receivedAt),
    index('github_webhook_deliveries_received').on(t.receivedAt),
  ],
);

/**
 * A portal person's GitHub identity, by GitHub's numeric user id (logins can
 * change and are refreshed from payloads). One account per person and one
 * person per account. Only a verified OAuth link or an admin creates one;
 * people.github_url is never trusted for it.
 */
export const githubAccounts = sqliteTable(
  'github_accounts',
  {
    personId: text('person_id')
      .primaryKey()
      .references(() => people.id),
    githubUserId: integer('github_user_id').notNull(),
    login: text('login').notNull(),
    method: text('method', { enum: ACCOUNT_LINK_METHODS }).notNull(),
    /** The admin who made an `admin` link. */
    linkedBy: text('linked_by').references(() => people.id),
    /** When GitHub OAuth proved the person controls the account. */
    verifiedAt: text('verified_at'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('github_accounts_user').on(t.githubUserId)],
);

/**
 * A linked person's user token, used to write to GitHub as them. Kept apart
 * from github_accounts so ordinary reads never load it. Token columns hold
 * AES-256-GCM ciphertext under GITHUB_TOKEN_ENCRYPTION_KEY, bound to the person
 * and the field: `v1.<key id>.<iv>.<ciphertext>` (base64url). They are null once revoked.
 */
export const githubUserTokens = sqliteTable('github_user_tokens', {
  personId: text('person_id')
    .primaryKey()
    .references(() => githubAccounts.personId, { onDelete: 'cascade' }),
  state: text('state', { enum: USER_TOKEN_STATES }).notNull().default('active'),
  accessToken: text('access_token'),
  /** Null when the App does not expire user tokens. */
  accessTokenExpiresAt: text('access_token_expires_at'),
  refreshToken: text('refresh_token'),
  refreshTokenExpiresAt: text('refresh_token_expires_at'),
  revokedReason: text('revoked_reason'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

/** Pending "Link GitHub" attempts: single use, deleted when used or expired. */
export const githubOauthStates = sqliteTable(
  'github_oauth_states',
  {
    /** SHA-256 (hex) of the state sent to GitHub; the state itself is never stored. */
    stateHash: text('state_hash').primaryKey(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    /** The PKCE (S256) verifier of this attempt. */
    codeVerifier: text('code_verifier').notNull(),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('github_oauth_states_expiry').on(t.expiresAt)],
);

/**
 * Idempotency for creates. GitHub takes no idempotency key, so a retried
 * request with the same (person, request id) returns the first result instead
 * of creating twice, and an outcome_unknown create is never retried blindly.
 */
export const githubWriteRequests = sqliteTable(
  'github_write_requests',
  {
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    requestId: text('request_id').notNull(),
    kind: text('kind', { enum: WRITE_REQUEST_KINDS }).notNull(),
    /** SHA-256 of the canonical request: the same request id with a different request is refused. */
    requestHash: text('request_hash').notNull(),
    status: text('status', { enum: WRITE_REQUEST_STATUSES }).notNull().default('pending'),
    result: text('result', { mode: 'json' }).$type<WriteRequestResult>(),
    error: text('error'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.personId, t.requestId] }), index('github_write_requests_created').on(t.createdAt)],
);

/**
 * In-app GitHub notices for linked people. `dedupe_key` is
 * `<kind>:<issue id>:<delivery id>` and unique per recipient, so a redelivered
 * webhook notifies once. Project access is checked again on every read.
 */
export const githubNotifications = sqliteTable(
  'github_notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipientId: text('recipient_id')
      .notNull()
      .references(() => people.id),
    kind: text('kind', { enum: GITHUB_NOTIFICATION_KINDS }).notNull(),
    issueId: text('issue_id')
      .notNull()
      .references(() => githubIssues.id, { onDelete: 'cascade' }),
    actorGithubId: integer('actor_github_id'),
    actorLogin: text('actor_login'),
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    readAt: text('read_at'),
  },
  (t) => [
    uniqueIndex('github_notifications_dedupe').on(t.recipientId, t.dedupeKey),
    index('github_notifications_inbox').on(t.recipientId, t.readAt, t.id),
    index('github_notifications_issue').on(t.issueId),
  ],
);

/** What happened in mapped repositories, at most one row per webhook delivery: the issue timeline and project activity. */
export const githubActivity = sqliteTable(
  'github_activity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    deliveryId: text('delivery_id').notNull(),
    repositoryId: integer('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    issueId: text('issue_id').references(() => githubIssues.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ACTIVITY_KINDS }).notNull(),
    actorGithubId: integer('actor_github_id'),
    actorLogin: text('actor_login'),
    detail: text('detail', { mode: 'json' }).$type<ActivityDetail>().notNull().default(sql`'{}'`),
    occurredAt: text('occurred_at').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex('github_activity_delivery').on(t.deliveryId),
    index('github_activity_repository').on(t.repositoryId, t.occurredAt),
    index('github_activity_issue').on(t.issueId, t.occurredAt),
  ],
);
