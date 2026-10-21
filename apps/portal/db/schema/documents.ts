import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import { people } from './people';
import { projectFiles } from './project-files';

/** Lifecycle metadata extends existing file identities, not a second file library. */
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  projectFileId: text('project_file_id').unique().references(() => projectFiles.id, { onDelete: 'cascade' }),
  sharedKey: text('shared_key').unique(),
  ownerId: text('owner_id').references(() => people.id, { onDelete: 'set null' }),
  retentionUntil: text('retention_until'),
  legalHold: integer('legal_hold', { mode: 'boolean' }).notNull().default(false),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  reviewStatus: text('review_status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  revision: integer('revision').notNull().default(1),
});

export const documentVersions = sqliteTable('document_versions', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  key: text('key').notNull().unique(),
  fileName: text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  bytes: integer('bytes').notNull(),
  checksum: text('checksum').notNull(),
  uploadedBy: text('uploaded_by').references(() => people.id, { onDelete: 'set null' }),
  restoredFrom: text('restored_from'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [uniqueIndex('document_versions_number').on(t.documentId, t.number)]);

export const documentShares = sqliteTable('document_shares', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  versionId: text('version_id').notNull().references(() => documentVersions.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: text('created_by').notNull().references(() => people.id),
  expiresAt: text('expires_at').notNull(),
  maxDownloads: integer('max_downloads'),
  downloads: integer('downloads').notNull().default(0),
  requireSignIn: integer('require_sign_in', { mode: 'boolean' }).notNull().default(false),
  revokedAt: text('revoked_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [index('document_shares_document').on(t.documentId)]);
