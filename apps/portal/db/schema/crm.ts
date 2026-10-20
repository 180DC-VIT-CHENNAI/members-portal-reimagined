import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import { consultingRequests } from './content';
import { people } from './people';
import { projects } from './projects';

export const CRM_LIFECYCLES = ['prospect', 'active_client', 'past_client', 'partner', 'inactive'] as const;
export const CRM_SOURCES = ['consulting_request', 'referral', 'outreach', 'event', 'other'] as const;
export const CRM_CONSENT = ['unknown', 'granted', 'withdrawn'] as const;
export const CRM_STAGE_KINDS = ['open', 'won', 'lost'] as const;
export const CRM_PRIORITIES = ['low', 'normal', 'high'] as const;
export const CRM_LOST_REASONS = ['no_response', 'not_a_fit', 'no_capacity', 'chose_other', 'budget', 'deferred', 'other'] as const;
export const CRM_TOUCHPOINT_KINDS = ['meeting', 'email', 'call', 'note', 'milestone'] as const;
export const CRM_PROPOSAL_STATUSES = ['draft', 'sent', 'accepted', 'declined'] as const;
export const CRM_CONFIDENTIALITY = ['standard', 'confidential', 'restricted'] as const;
export const CRM_ENGAGEMENT_STATUSES = ['active', 'closed'] as const;
export const CRM_RECORD_TYPES = ['organization', 'contact', 'opportunity'] as const;
export const CRM_GRANT_ROLES = ['owner', 'collaborator'] as const;

export type CrmStageKind = (typeof CRM_STAGE_KINDS)[number];
export type CrmLostReason = (typeof CRM_LOST_REASONS)[number];
export type CrmProposalStatus = (typeof CRM_PROPOSAL_STATUSES)[number];
export type CrmRecordType = (typeof CRM_RECORD_TYPES)[number];

const created = {
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
};

/** Pipeline columns. Admins add, rename, order and retire open stages; one won and one lost stage are fixed. */
export const crmStages = sqliteTable('crm_stages', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  kind: text('kind', { enum: CRM_STAGE_KINDS }).notNull().default('open'),
  sortOrder: integer('sort_order').notNull().default(100),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/** A client or prospect organisation. `domain` is the normalised website host used to find duplicates. */
export const crmOrganizations = sqliteTable(
  'crm_organizations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    website: text('website'),
    domain: text('domain'),
    industry: text('industry'),
    geography: text('geography'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    lifecycle: text('lifecycle', { enum: CRM_LIFECYCLES }).notNull().default('prospect'),
    ownerId: text('owner_id').references(() => people.id),
    source: text('source', { enum: CRM_SOURCES }).notNull().default('other'),
    /** Set when an admin merged this record into another; merged records are hidden everywhere. */
    mergedIntoId: text('merged_into_id'),
    ...created,
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('crm_organizations_owner').on(t.ownerId), index('crm_organizations_domain').on(t.domain)],
);

/** A person at an organisation. Email, phone, consent and notes are private to the organisation's people. */
export const crmContacts = sqliteTable(
  'crm_contacts',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => crmOrganizations.id),
    fullName: text('full_name').notNull(),
    roleTitle: text('role_title'),
    email: text('email'),
    phone: text('phone'),
    consent: text('consent', { enum: CRM_CONSENT }).notNull().default('unknown'),
    doNotContact: integer('do_not_contact', { mode: 'boolean' }).notNull().default(false),
    preferredChannel: text('preferred_channel'),
    restrictedNotes: text('restricted_notes'),
    mergedIntoId: text('merged_into_id'),
    ...created,
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('crm_contacts_organization').on(t.organizationId), index('crm_contacts_email').on(t.email)],
);

/** One possible engagement. `consulting_request_id` makes converting a request idempotent. */
export const crmOpportunities = sqliteTable(
  'crm_opportunities',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => crmOrganizations.id),
    primaryContactId: text('primary_contact_id').references(() => crmContacts.id),
    title: text('title').notNull(),
    ownerId: text('owner_id').references(() => people.id),
    source: text('source', { enum: CRM_SOURCES }).notNull().default('other'),
    stageId: text('stage_id')
      .notNull()
      .references(() => crmStages.id),
    priority: text('priority', { enum: CRM_PRIORITIES }).notNull().default('normal'),
    nextAction: text('next_action'),
    /** YYYY-MM-DD. */
    nextActionDue: text('next_action_due'),
    lostReason: text('lost_reason', { enum: CRM_LOST_REASONS }),
    lostNote: text('lost_note'),
    consultingRequestId: text('consulting_request_id').references(() => consultingRequests.id, { onDelete: 'set null' }),
    closedAt: text('closed_at'),
    ...created,
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex('crm_opportunities_request').on(t.consultingRequestId),
    index('crm_opportunities_organization').on(t.organizationId),
    index('crm_opportunities_owner_due').on(t.ownerId, t.nextActionDue),
    index('crm_opportunities_stage').on(t.stageId),
  ],
);

/** A meeting, call, note or milestone; for email only a reference to the message is kept, never its body. */
export const crmTouchpoints = sqliteTable(
  'crm_touchpoints',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: CRM_TOUCHPOINT_KINDS }).notNull(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => crmOrganizations.id),
    contactId: text('contact_id').references(() => crmContacts.id),
    opportunityId: text('opportunity_id').references(() => crmOpportunities.id),
    summary: text('summary').notNull(),
    notes: text('notes'),
    /** Opaque id of the linked message or calendar event elsewhere. */
    externalRef: text('external_ref'),
    occurredAt: text('occurred_at').notNull(),
    ...created,
  },
  (t) => [index('crm_touchpoints_organization').on(t.organizationId, t.occurredAt), index('crm_touchpoints_opportunity').on(t.opportunityId, t.occurredAt)],
);

/** A proposal for an opportunity; its content lives in numbered versions. */
export const crmProposals = sqliteTable(
  'crm_proposals',
  {
    id: text('id').primaryKey(),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => crmOpportunities.id),
    title: text('title').notNull(),
    status: text('status', { enum: CRM_PROPOSAL_STATUSES }).notNull().default('draft'),
    currentVersion: integer('current_version').notNull().default(1),
    decidedAt: text('decided_at'),
    ...created,
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('crm_proposals_opportunity').on(t.opportunityId)],
);

/** Proposal content. A version is frozen once it is sent or superseded and never changes again. */
export const crmProposalVersions = sqliteTable(
  'crm_proposal_versions',
  {
    id: text('id').primaryKey(),
    proposalId: text('proposal_id')
      .notNull()
      .references(() => crmProposals.id),
    version: integer('version').notNull(),
    scope: text('scope').notNull(),
    objectives: text('objectives').notNull().default(''),
    timeline: text('timeline').notNull().default(''),
    deliverables: text('deliverables').notNull().default(''),
    frozenAt: text('frozen_at'),
    ...created,
  },
  (t) => [uniqueIndex('crm_proposal_versions_number').on(t.proposalId, t.version)],
);

/** Accepted work, linked to its canonical project. */
export const crmEngagements = sqliteTable(
  'crm_engagements',
  {
    id: text('id').primaryKey(),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => crmOpportunities.id),
    proposalId: text('proposal_id')
      .notNull()
      .references(() => crmProposals.id),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    clientOwnerId: text('client_owner_id').references(() => people.id),
    leadId: text('lead_id').references(() => people.id),
    confidentiality: text('confidentiality', { enum: CRM_CONFIDENTIALITY }).notNull().default('confidential'),
    status: text('status', { enum: CRM_ENGAGEMENT_STATUSES }).notNull().default('active'),
    deliverablesAccepted: integer('deliverables_accepted', { mode: 'boolean' }).notNull().default(false),
    filesArchived: integer('files_archived', { mode: 'boolean' }).notNull().default(false),
    knowledgeTransferDone: integer('knowledge_transfer_done', { mode: 'boolean' }).notNull().default(false),
    clientFeedback: text('client_feedback'),
    caseStudyConsent: integer('case_study_consent', { mode: 'boolean' }).notNull().default(false),
    closedAt: text('closed_at'),
    ...created,
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('crm_engagements_opportunity').on(t.opportunityId), uniqueIndex('crm_engagements_project').on(t.projectId)],
);

/** Case-study drafts created at closeout with client consent. Nothing here is public; publishing is a separate reviewed step. */
export const crmCaseStudyDrafts = sqliteTable('crm_case_study_drafts', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id')
    .notNull()
    .unique()
    .references(() => crmEngagements.id),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  status: text('status', { enum: ['draft'] }).notNull().default('draft'),
  ...created,
});

/** Explicit per-record access. An organisation grant covers its contacts and opportunities. */
export const crmRecordAccess = sqliteTable(
  'crm_record_access',
  {
    id: text('id').primaryKey(),
    recordType: text('record_type', { enum: CRM_RECORD_TYPES }).notNull(),
    recordId: text('record_id').notNull(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    role: text('role', { enum: CRM_GRANT_ROLES }).notNull().default('collaborator'),
    ...created,
  },
  (t) => [uniqueIndex('crm_record_access_unique').on(t.recordType, t.recordId, t.personId), index('crm_record_access_person').on(t.personId, t.recordType)],
);
