import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'void/schema-d1';

/** Case studies shown on the public site. `content` is sanitised HTML. */
export const caseStudies = sqliteTable(
  'case_studies',
  {
    id: text('id').primaryKey(),
    tag: text('tag').notNull().default('Uncategorized'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    content: text('content').notNull().default(''),
    imageUrl: text('image_url'),
    sourceFileUrl: text('source_file_url'),
    authorName: text('author_name').notNull().default('Anonymous'),
    /** people.id of the author; never exposed publicly. */
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('case_studies_created').on(t.createdAt)],
);

/** Client organisations shown in the public "Our clients" strip. */
export const partners = sqliteTable('partners', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  logoUrl: text('logo_url'),
  websiteUrl: text('website_url'),
  sortOrder: integer('sort_order').notNull().default(100),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const CONSULTING_STATUSES = ['pending', 'accepted', 'rejected'] as const;

/** "Work with us" submissions from the public site. */
export const consultingRequests = sqliteTable(
  'consulting_requests',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    organization: text('organization').notNull(),
    roleInOrg: text('role_in_org'),
    requirement: text('requirement').notNull(),
    status: text('status', { enum: CONSULTING_STATUSES }).notNull().default('pending'),
    decidedBy: text('decided_by'),
    decidedAt: text('decided_at'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('consulting_requests_status').on(t.status)],
);

/** The reply recorded when a request is accepted or rejected. */
export const consultingResponses = sqliteTable(
  'consulting_responses',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id')
      .notNull()
      .references(() => consultingRequests.id, { onDelete: 'cascade' }),
    emailSubject: text('email_subject').notNull(),
    emailBody: text('email_body').notNull(),
    sentBy: text('sent_by'),
    sentAt: text('sent_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('consulting_responses_request').on(t.requestId)],
);

/** Club-wide notices for signed-in members. */
export const announcements = sqliteTable('announcements', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/** Single row (id 1). While enabled, only people with `site.maintenance` keep API access. */
export const maintenanceMode = sqliteTable('maintenance_mode', {
  id: integer('id').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  message: text('message').notNull().default('Site is under maintenance. Please check back later.'),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

/** Fixed-window request counters per client IP and endpoint. */
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    ip: text('ip').notNull(),
    endpoint: text('endpoint').notNull(),
    count: integer('count').notNull().default(1),
    windowStart: text('window_start').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.ip, t.endpoint] })],
);
