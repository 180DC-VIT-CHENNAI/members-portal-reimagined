import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import type { LetterType } from '../../src/lib/letter-kinds';
import { departments } from './org';

/** Immutable PDF and matching operator-supplied metadata; never stored in public club-file listings. */
export const letterDocuments = sqliteTable('letter_documents', {
  id: text('id').primaryKey(), key: text('key').notNull().unique(), filename: text('filename').notNull(),
  bytes: integer('bytes').notNull(), type: text('type').$type<LetterType>().notNull(), docnum: text('docnum').notNull(),
  departmentId: text('department_id').references(() => departments.id),
  snapshot: text('snapshot', { mode: 'json' }).$type<Record<string, string>>().notNull(),
  createdBy: text('created_by').notNull(), createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [index('letter_documents_department').on(t.departmentId, t.createdAt)]);

export const LETTER_SEND_STATUSES = ['queued', 'accepted', 'failed', 'uncertain'] as const;
/** Durable send intents survive the generic campaign's 30-day retention. Acceptance is not inbox delivery. */
export const letterSends = sqliteTable('letter_sends', {
  id: text('id').primaryKey(), documentId: text('document_id').notNull().references(() => letterDocuments.id),
  recipient: text('recipient').notNull(), requestId: text('request_id').notNull(), campaignId: text('campaign_id').notNull(),
  status: text('status', { enum: LETTER_SEND_STATUSES }).notNull().default('queued'),
  lastError: text('last_error'), acceptedAt: text('accepted_at'), createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [uniqueIndex('letter_sends_request').on(t.createdBy, t.requestId), index('letter_sends_document').on(t.documentId)]);
