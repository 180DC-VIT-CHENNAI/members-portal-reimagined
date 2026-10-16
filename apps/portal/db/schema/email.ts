import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'void/schema-d1';

export const EMAIL_QUEUE_STATUSES = ['pending', 'processing', 'done', 'failed'] as const;
export const EMAIL_DELIVERY_STATUSES = ['sent', 'failed', 'skipped'] as const;

export type QueueAttachment = {
  readonly filename: string;
  readonly key: string;
  readonly contentType?: string;
};

/** One campaign, sent as one message per recipient; never a BCC batch. */
export const emailQueue = sqliteTable('email_queue', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  fromAddress: text('from_address').notNull(),
  subject: text('subject').notNull(),
  html: text('html').notNull(),
  attachments: text('attachments', { mode: 'json' }).$type<QueueAttachment[]>(),
  recipients: text('recipients', { mode: 'json' }).$type<string[]>().notNull(),
  cursor: integer('cursor').notNull().default(0),
  total: integer('total').notNull(),
  sent: integer('sent').notNull().default(0),
  failed: integer('failed').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  status: text('status', { enum: EMAIL_QUEUE_STATUSES }).notNull().default('pending'),
  lastError: text('last_error'),
  meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  finishedAt: text('finished_at'),
}, (t) => [
  index('email_queue_status_created').on(t.status, t.createdAt),
  index('email_queue_status_updated').on(t.status, t.updatedAt),
]);

/** SMTP acceptance, not proof of inbox delivery. */
export const emailDeliveries = sqliteTable('email_deliveries', {
  campaignId: text('campaign_id').notNull(),
  recipient: text('recipient').notNull(),
  status: text('status', { enum: EMAIL_DELIVERY_STATUSES }).notNull(),
  error: text('error'),
  attempts: integer('attempts').notNull().default(0),
  sentAt: text('sent_at'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [primaryKey({ columns: [t.campaignId, t.recipient] })]);

export const emailHourCount = sqliteTable('email_hour_count', {
  hour: text('hour').primaryKey(),
  count: integer('count').notNull().default(0),
});

/** Reporting counter only; no daily quota is enforced. */
export const dailyEmailCount = sqliteTable('daily_email_count', {
  date: text('date').primaryKey(),
  count: integer('count').notNull().default(0),
});

export const devOutbox = sqliteTable('dev_outbox', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipient: text('recipient').notNull(),
  fromAddress: text('from_address'),
  subject: text('subject'),
  html: text('html'),
  headers: text('headers', { mode: 'json' }).$type<Record<string, string>>(),
  attachments: text('attachments', { mode: 'json' }).$type<string[]>(),
  deliveredTo: text('delivered_to'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
