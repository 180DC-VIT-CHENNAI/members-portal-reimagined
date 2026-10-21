import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import { mailboxes, mailDrafts } from './mailboxes';
import { people } from './people';
import { CONVERSATION_STATUSES, MAIL_PRIORITIES, type MailIdentity } from '../../src/server/mailboxes/inbox-types';

export const mailConversations = sqliteTable('mail_conversations', {
  id: text('id').primaryKey(),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  subject: text('subject').notNull(),
  subjectKey: text('subject_key').notNull(),
  status: text('status', { enum: CONVERSATION_STATUSES }).notNull().default('open'),
  priority: text('priority', { enum: MAIL_PRIORITIES }).notNull().default('normal'),
  tags: text('tags', { mode: 'json' }).$type<readonly string[]>().notNull().default(sql`'[]'`),
  assignedTo: text('assigned_to').references(() => people.id),
  dueForReplyAt: text('due_for_reply_at'),
  crmContactId: text('crm_contact_id'),
  lastMessageAt: text('last_message_at').notNull(),
  lastInboundAt: text('last_inbound_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('mail_conversations_inbox').on(t.mailboxId, t.status, t.lastMessageAt, t.id),
  index('mail_conversations_subject').on(t.mailboxId, t.subjectKey),
  check('mail_conversations_status', sql`${t.status} IN ('open','pending','closed')`),
  check('mail_conversations_priority', sql`${t.priority} IN ('low','normal','high','urgent')`),
]);

export const mailMessages = sqliteTable('mail_messages', {
  id: text('id').primaryKey(),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  conversationId: text('conversation_id').references(() => mailConversations.id),
  direction: text('direction', { enum: ['in', 'out'] }).notNull(),
  status: text('status', { enum: ['received', 'quarantined', 'accepted', 'outcome_unknown'] }).notNull(),
  quarantineReason: text('quarantine_reason'),
  rfcMessageId: text('rfc_message_id'),
  providerMessageId: text('provider_message_id'),
  inReplyTo: text('in_reply_to'),
  references: text('references_json', { mode: 'json' }).$type<readonly string[]>().notNull(),
  outboundId: text('outbound_id'),
  envelopeFrom: text('envelope_from').notNull(),
  envelopeTo: text('envelope_to').notNull(),
  from: text('from_json', { mode: 'json' }).$type<MailIdentity>().notNull(),
  to: text('to_json', { mode: 'json' }).$type<readonly MailIdentity[]>().notNull(),
  cc: text('cc_json', { mode: 'json' }).$type<readonly MailIdentity[]>().notNull(),
  replyTo: text('reply_to_json', { mode: 'json' }).$type<readonly MailIdentity[]>().notNull(),
  subject: text('subject').notNull(),
  text: text('text').notNull(),
  htmlKey: text('html_object_key'),
  rawKey: text('raw_object_key'),
  rawSha256: text('raw_sha256'),
  rawSize: integer('raw_size').notNull(),
  authSignals: text('auth_signals').notNull().default(''),
  receivedAt: text('received_at').notNull(),
}, (t) => [
  index('mail_messages_thread').on(t.mailboxId, t.conversationId, t.receivedAt, t.id),
  index('mail_messages_rfc').on(t.mailboxId, t.rfcMessageId),
  index('mail_messages_quarantine').on(t.mailboxId, t.status, t.receivedAt),
  uniqueIndex('mail_messages_outbound').on(t.outboundId),
  check('mail_messages_direction', sql`${t.direction} IN ('in','out')`),
  check('mail_messages_status', sql`${t.status} IN ('received','quarantined','accepted','outcome_unknown')`),
]);

export const mailAttachments = sqliteTable('mail_attachments', {
  id: text('id').primaryKey(),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  messageId: text('message_id').notNull().references(() => mailMessages.id),
  key: text('object_key').notNull(),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  contentId: text('content_id'),
  inline: integer('inline', { mode: 'boolean' }).notNull().default(false),
  quarantineStatus: text('quarantine_status', { enum: ['allowed', 'quarantined'] }).notNull(),
}, (t) => [index('mail_attachments_message').on(t.mailboxId, t.messageId)]);

export const mailInboundEvents = sqliteTable('mail_inbound_events', {
  id: text('id').primaryKey(),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  rawSha256: text('raw_sha256').notNull(),
  contentKey: text('content_key').notNull(),
  messageId: text('message_id'),
  createdAt: text('created_at').notNull(),
}, (t) => [
  uniqueIndex('mail_inbound_raw').on(t.mailboxId, t.rawSha256),
  uniqueIndex('mail_inbound_content').on(t.mailboxId, t.contentKey),
]);

export const mailConversationParticipants = sqliteTable('mail_conversation_participants', {
  conversationId: text('conversation_id').notNull().references(() => mailConversations.id),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  address: text('address').notNull(),
}, (t) => [primaryKey({ columns: [t.conversationId, t.address] }), index('mail_participants_address').on(t.mailboxId, t.address)]);

export const mailConversationReads = sqliteTable('mail_conversation_reads', {
  conversationId: text('conversation_id').notNull().references(() => mailConversations.id),
  personId: text('person_id').notNull().references(() => people.id),
  readAt: text('read_at').notNull(),
}, (t) => [primaryKey({ columns: [t.conversationId, t.personId] })]);

export const mailConversationNotes = sqliteTable('mail_conversation_notes', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => mailConversations.id),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  authorId: text('author_id').notNull().references(() => people.id),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('mail_notes_conversation').on(t.mailboxId, t.conversationId, t.createdAt)]);

/** Mail events in the shared notification inbox. No sender, subject or body is copied here. */
export const mailNotifications = sqliteTable('mail_notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipientId: text('recipient_id').notNull().references(() => people.id),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  conversationId: text('conversation_id').references(() => mailConversations.id),
  draftId: text('draft_id').references(() => mailDrafts.id),
  kind: text('kind', { enum: ['mail_reply', 'mail_assigned', 'mail_review'] }).notNull(),
  dedupeKey: text('dedupe_key').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  readAt: text('read_at'),
}, (t) => [
  uniqueIndex('mail_notifications_once').on(t.recipientId, t.dedupeKey),
  index('mail_notifications_inbox').on(t.recipientId, t.readAt, t.id),
]);
