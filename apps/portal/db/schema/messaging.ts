import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import { departments } from './org';
import { people } from './people';
import { projects } from './projects';

export const CONVERSATION_KINDS = ['direct', 'department', 'project'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

/**
 * Internal conversations. A `direct` conversation is between exactly two
 * people, identified by `direct_key` (`<lower id>:<higher id>`, unique). A
 * `department` or `project` channel has one row per department or project and
 * is created the first time someone with access opens it. Access to a channel
 * always comes from the underlying department or project, never from a row in
 * `conversation_members`.
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: CONVERSATION_KINDS }).notNull(),
    directKey: text('direct_key'),
    departmentId: text('department_id').references(() => departments.id),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').references(() => people.id),
    /** Newest message id, for ordering the conversation list. */
    lastMessageId: integer('last_message_id'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex('conversations_direct').on(t.directKey),
    uniqueIndex('conversations_department').on(t.departmentId),
    uniqueIndex('conversations_project').on(t.projectId),
  ],
);

/**
 * Per-person conversation state. For a direct conversation the two rows are
 * its participants; for a channel a row only holds the reader's read pointer
 * and mute switch and is created on first read or mute.
 */
export const conversationMembers = sqliteTable(
  'conversation_members',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    /** Messages with an id at or below this are read; 0 = nothing read. */
    lastReadMessageId: integer('last_read_message_id').notNull().default(0),
    muted: integer('muted', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.personId] }), index('conversation_members_person').on(t.personId)],
);

/**
 * Plain-text messages; mentions are written inline as `@[Name](person id)`.
 * Deleting keeps the row as a tombstone with an empty body, so replies and
 * read pointers stay valid. `(author_id, request_id)` makes a retried send
 * return the first message.
 */
export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => people.id),
    body: text('body').notNull(),
    replyToId: integer('reply_to_id'),
    requestId: text('request_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    editedAt: text('edited_at'),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('messages_conversation').on(t.conversationId, t.id), uniqueIndex('messages_request').on(t.authorId, t.requestId)],
);

export const messageReactions = sqliteTable(
  'message_reactions',
  {
    messageId: integer('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    emoji: text('emoji', { enum: ['👍', '❤️', '😂', '🎉', '👀', '✅'] }).notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.personId, t.emoji] })],
);

export const MESSAGE_REPORT_STATUSES = ['open', 'resolved'] as const;

/** Abuse reports, one per reporter and message, reviewed by holders of `chat.moderate`. */
export const messageReports = sqliteTable(
  'message_reports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: integer('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => people.id),
    reason: text('reason').notNull(),
    status: text('status', { enum: MESSAGE_REPORT_STATUSES }).notNull().default('open'),
    resolvedBy: text('resolved_by').references(() => people.id),
    resolvedAt: text('resolved_at'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('message_reports_once').on(t.messageId, t.reporterId), index('message_reports_status').on(t.status, t.id)],
);

export const MESSAGE_NOTIFICATION_KINDS = ['message_mention'] as const;

/**
 * Inbox notices about messages. Kept apart from `notifications`, whose rows
 * require a task. Conversation access and the message's tombstone are checked
 * again on every read, so a notice never reveals a conversation the reader
 * has lost or a deleted body.
 */
export const messageNotifications = sqliteTable(
  'message_notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipientId: text('recipient_id')
      .notNull()
      .references(() => people.id),
    kind: text('kind', { enum: MESSAGE_NOTIFICATION_KINDS }).notNull(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    messageId: integer('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => people.id),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    readAt: text('read_at'),
  },
  (t) => [
    uniqueIndex('message_notifications_once').on(t.recipientId, t.messageId),
    index('message_notifications_inbox').on(t.recipientId, t.readAt, t.id),
  ],
);

export const NOTIFICATION_CATEGORIES = ['mentions', 'tasks'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * Per person and category; a missing row means the defaults: in-app on,
 * email digest off, no quiet hours. Email digests are stored only: nothing
 * sends them yet (they would be metered mail, see README).
 */
export const notificationPreferences = sqliteTable(
  'notification_preferences',
  {
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    category: text('category', { enum: NOTIFICATION_CATEGORIES }).notNull(),
    inApp: integer('in_app', { mode: 'boolean' }).notNull().default(true),
    emailDigest: integer('email_digest', { mode: 'boolean' }).notNull().default(false),
    /** HH:MM in Asia/Kolkata; both set or both null. */
    quietStart: text('quiet_start'),
    quietEnd: text('quiet_end'),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.personId, t.category] })],
);
