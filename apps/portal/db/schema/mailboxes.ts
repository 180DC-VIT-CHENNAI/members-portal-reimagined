import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex, check } from 'void/schema-d1';
import { people } from './people';
import {
  DRAFT_STATES, INTENT_STATES, MAIL_ADAPTERS, MAIL_CATEGORIES, MAILBOX_CAPABILITIES, MAILBOX_STATUSES,
  type MailAttachment, type MailRecipients,
} from '../../src/server/mailboxes/types';

export const mailboxes = sqliteTable('mailboxes', {
  id: text('id').primaryKey(),
  address: text('address').notNull(),
  displayName: text('display_name').notNull(),
  purpose: text('purpose').notNull().default(''),
  status: text('status', { enum: MAILBOX_STATUSES }).notNull().default('active'),
  inboundEnabled: integer('inbound_enabled', { mode: 'boolean' }).notNull().default(false),
  approvalRequired: integer('approval_required', { mode: 'boolean' }).notNull().default(true),
  requireDistinctReviewer: integer('require_distinct_reviewer', { mode: 'boolean' }).notNull().default(true),
  signature: text('signature').notNull().default(''),
  outboundAdapter: text('outbound_adapter', { enum: MAIL_ADAPTERS }).notNull().default('disabled'),
  repliesOnly: integer('replies_only', { mode: 'boolean' }).notNull().default(true),
  categoryPolicy: text('category_policy', { mode: 'json' }).$type<readonly (typeof MAIL_CATEGORIES)[number][]>().notNull().default(sql`'["correspondence"]'`),
  outboundPaused: integer('outbound_paused', { mode: 'boolean' }).notNull().default(false),
  policyVersion: integer('policy_version').notNull().default(1),
  createdBy: text('created_by').notNull().references(() => people.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [uniqueIndex('mailboxes_address').on(t.address), check('mailboxes_status_valid', sql`${t.status} IN ('active','disabled','retired')`)]);

export const mailboxMemberships = sqliteTable('mailbox_memberships', {
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  personId: text('person_id').notNull().references(() => people.id),
  capability: text('capability', { enum: MAILBOX_CAPABILITIES }).notNull(),
  validFrom: text('valid_from').notNull(),
  validUntil: text('valid_until'),
  grantedBy: text('granted_by').notNull().references(() => people.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  primaryKey({ columns: [t.mailboxId, t.personId, t.capability] }),
  index('mailbox_memberships_person').on(t.personId, t.mailboxId),
  check('mailbox_memberships_capability_valid', sql`${t.capability} IN ('mailbox.read','mailbox.draft.create','mailbox.draft.edit_own','mailbox.draft.edit_any','mailbox.draft.submit','mailbox.review','mailbox.approve','mailbox.send','mailbox.assign','mailbox.manage','mailbox.audit')`),
]);

export const mailUploads = sqliteTable('mail_uploads', {
  id: text('id').primaryKey(),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  key: text('object_key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  bytes: integer('bytes').notNull(),
  digest: text('digest').notNull(),
  createdBy: text('created_by').notNull().references(() => people.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [index('mail_uploads_mailbox').on(t.mailboxId)]);

export const mailDrafts = sqliteTable('mail_drafts', {
  id: text('id').primaryKey(),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  /** Logical link validated server-side; adding an FK would rebuild this live table. */
  conversationId: text('conversation_id'),
  createdBy: text('created_by').notNull().references(() => people.id),
  revision: integer('revision').notNull().default(1),
  state: text('state', { enum: DRAFT_STATES }).notNull().default('draft'),
  currentSnapshotId: text('current_snapshot_id').notNull(),
  approvedReviewId: text('approved_review_id'),
  lastReviewId: text('last_review_id'),
  activeIntentId: text('active_intent_id'),
  updatedAt: text('updated_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [index('mail_drafts_folder').on(t.mailboxId, t.state, t.updatedAt, t.id)]);

export const mailDraftSnapshots = sqliteTable('mail_draft_snapshots', {
  id: text('id').primaryKey(),
  draftId: text('draft_id').notNull().references(() => mailDrafts.id),
  revision: integer('revision').notNull(),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  conversationId: text('conversation_id'),
  fromAddress: text('from_address').notNull(),
  fromName: text('from_name').notNull(),
  recipients: text('recipients', { mode: 'json' }).$type<MailRecipients>().notNull(),
  subject: text('subject').notNull(),
  text: text('text').notNull(),
  html: text('html').notNull(),
  signature: text('signature').notNull(),
  category: text('category', { enum: MAIL_CATEGORIES }).notNull(),
  attachments: text('attachments', { mode: 'json' }).$type<readonly MailAttachment[]>().notNull(),
  templateVersionId: text('template_version_id'),
  contentHash: text('content_hash').notNull(),
  createdBy: text('created_by').notNull().references(() => people.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [uniqueIndex('mail_snapshot_revision').on(t.draftId, t.revision)]);

export const mailReviews = sqliteTable('mail_reviews', {
  id: text('id').primaryKey(),
  draftId: text('draft_id').notNull().references(() => mailDrafts.id),
  snapshotId: text('snapshot_id').notNull().references(() => mailDraftSnapshots.id),
  contentHash: text('content_hash').notNull(),
  policyVersion: integer('policy_version').notNull(),
  reviewerId: text('reviewer_id').notNull().references(() => people.id),
  decision: text('decision', { enum: ['submitted', 'changes_requested', 'rejected', 'approved'] }).notNull(),
  /** Direct authorization exists only when approval_required is false. */
  direct: integer('direct', { mode: 'boolean' }).notNull().default(false),
  comments: text('comments').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [index('mail_reviews_draft').on(t.draftId, t.createdAt)]);

export const mailSendIntents = sqliteTable('mail_send_intents', {
  id: text('id').primaryKey(),
  draftId: text('draft_id').notNull().references(() => mailDrafts.id),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  approvedSnapshotId: text('approved_snapshot_id').notNull().references(() => mailDraftSnapshots.id),
  approvalReviewId: text('approval_review_id').notNull().references(() => mailReviews.id),
  idempotencyKey: text('idempotency_key').notNull(),
  state: text('state', { enum: INTENT_STATES }).notNull(),
  scheduledAt: text('scheduled_at'),
  dueAt: text('due_at').notNull(),
  attemptCount: integer('attempt_count').notNull().default(0),
  claimedAt: text('claimed_at'),
  claimToken: text('claim_token'),
  providerMessageId: text('provider_message_id'),
  lastError: text('last_error'),
  createdBy: text('created_by').notNull().references(() => people.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  uniqueIndex('mail_send_idempotency').on(t.idempotencyKey),
  uniqueIndex('mail_send_active_draft').on(t.draftId).where(sql`${t.state} <> 'cancelled'`),
  index('mail_send_due').on(t.state, t.dueAt),
]);

export const mailSendAttempts = sqliteTable('mail_send_attempts', {
  id: text('id').primaryKey(),
  intentId: text('intent_id').notNull().references(() => mailSendIntents.id),
  attemptNo: integer('attempt_no').notNull(),
  provider: text('provider').notNull(),
  providerMessageId: text('provider_message_id'),
  outcome: text('outcome', { enum: ['started', 'accepted', 'failed', 'outcome_unknown'] }).notNull(),
  errorCode: text('error_code'),
  recipientResults: text('recipient_results', { mode: 'json' }).$type<readonly { readonly recipient: string; readonly accepted: boolean; readonly messageId?: string; readonly code?: string }[]>(),
  createdAt: text('created_at').notNull(),
  finishedAt: text('finished_at'),
}, (t) => [uniqueIndex('mail_attempt_number').on(t.intentId, t.attemptNo)]);

export const mailAudit = sqliteTable('mail_audit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  actorId: text('actor_id').references(() => people.id),
  action: text('action').notNull(),
  targetId: text('target_id'),
  metadata: text('safe_metadata', { mode: 'json' }).$type<Readonly<Record<string, string | number | boolean | null>>>().notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [index('mail_audit_page').on(t.mailboxId, t.id)]);

/** Emergency shared-mail stop; independent of general site maintenance. */
export const mailOutboundSwitch = sqliteTable('mail_outbound_switch', {
  id: integer('id').primaryKey(),
  paused: integer('paused', { mode: 'boolean' }).notNull().default(false),
  updatedBy: text('updated_by').references(() => people.id),
  updatedAt: text('updated_at').notNull(),
});
