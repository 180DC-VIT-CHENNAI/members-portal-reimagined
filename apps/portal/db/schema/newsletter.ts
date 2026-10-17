import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'void/schema-d1';

export const SUBSCRIBER_STATUSES = ['pending', 'active', 'unsubscribed'] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

/** Email-only double opt-in. Credentials grant subscription actions, never portal access. */
export const newsletterSubscribers = sqliteTable('newsletter_subscribers', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  status: text('status', { enum: SUBSCRIBER_STATUSES }).notNull().default('pending'),
  unsubscribeToken: text('unsubscribe_token').notNull(),
  confirmTokenHash: text('confirm_token_hash'),
  confirmExpiresAt: text('confirm_expires_at'),
  confirmedAt: text('confirmed_at'),
  /** Historical last unsubscribe time; status alone determines the current subscription. */
  lastUnsubscribedAt: text('last_unsubscribed_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  uniqueIndex('newsletter_subscribers_email').on(t.email),
  uniqueIndex('newsletter_subscribers_unsubscribe').on(t.unsubscribeToken),
  uniqueIndex('newsletter_subscribers_confirm').on(t.confirmTokenHash),
  index('newsletter_subscribers_status').on(t.status),
]);

/** Uploaded newsletter source documents and posters. Public object keys are generated, never user paths. */
export const newsletterAssets = sqliteTable('newsletter_assets', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  bytes: integer('bytes').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/** Issue numbers come from SQLite's atomic row allocator, not a racy max-slug lookup. */
export const newsletters = sqliteTable('newsletters', {
  issue: integer('issue').primaryKey({ autoIncrement: true }),
  id: text('id').notNull().unique(),
  title: text('title').notNull(),
  emailSubject: text('email_subject').notNull(),
  description: text('description'),
  content: text('content').notNull().default(''),
  sourceAssetId: text('source_asset_id').references(() => newsletterAssets.id),
  imageAssetId: text('image_asset_id').references(() => newsletterAssets.id),
  shared: integer('shared', { mode: 'boolean' }).notNull().default(false),
  version: integer('version').notNull().default(1),
  broadcastId: text('broadcast_id'),
  sentAt: text('sent_at'),
  recipientCount: integer('recipient_count').notNull().default(0),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});
