import {
  crmCaseStudyDrafts,
  crmEngagements,
  crmOpportunities,
  crmOrganizations,
  crmProposals,
  crmProposalVersions,
  people,
  projects,
} from '@schema';
import type * as v from 'valibot';
import { alias } from 'drizzle-orm/sqlite-core';
import { and, db, desc, eq, sql } from 'void/db';
import { badRequest, conflict, notFound } from '../http';
import type { Principal } from '../principal';
import { type CrmAccess, opportunityAccess, visibleOpportunities } from './access';
import type { closeoutFields } from './fields';
import { closeoutMissing } from './rules';

export type Engagement = typeof crmEngagements.$inferSelect;
type Closeout = v.InferOutput<v.ObjectSchema<typeof closeoutFields, undefined>>;

const lead = alias(people, 'lead');
const clientOwner = alias(people, 'client_owner');

/** An engagement the caller can see through its opportunity; 404 otherwise. */
export async function loadEngagement(principal: Principal, id: string) {
  const [row] = await db
    .select({ engagement: crmEngagements, opportunity: crmOpportunities, org: crmOrganizations })
    .from(crmEngagements)
    .innerJoin(crmOpportunities, eq(crmOpportunities.id, crmEngagements.opportunityId))
    .innerJoin(crmOrganizations, eq(crmOrganizations.id, crmOpportunities.organizationId))
    .where(eq(crmEngagements.id, id));
  if (!row) notFound('engagement_not_found');
  const access = await opportunityAccess(principal, row.opportunity, row.org);
  if (!access.view) notFound('engagement_not_found');
  return { ...row, access };
}

export function listEngagements(principal: Principal) {
  return db
    .select({
      id: crmEngagements.id,
      status: crmEngagements.status,
      confidentiality: crmEngagements.confidentiality,
      opportunityTitle: crmOpportunities.title,
      organizationName: crmOrganizations.name,
      projectId: crmEngagements.projectId,
      leadName: lead.fullName,
      createdAt: crmEngagements.createdAt,
    })
    .from(crmEngagements)
    .innerJoin(crmOpportunities, eq(crmOpportunities.id, crmEngagements.opportunityId))
    .innerJoin(crmOrganizations, eq(crmOrganizations.id, crmOpportunities.organizationId))
    .leftJoin(lead, eq(lead.id, crmEngagements.leadId))
    .where(visibleOpportunities(principal))
    .orderBy(desc(crmEngagements.createdAt))
    .limit(200);
}

export async function engagementDetail(loaded: Awaited<ReturnType<typeof loadEngagement>>) {
  const { engagement, opportunity, org, access } = loaded;
  const [names, project, proposal, draft] = await Promise.all([
    db
      .select({ leadName: lead.fullName, clientOwnerName: clientOwner.fullName })
      .from(crmEngagements)
      .leftJoin(lead, eq(lead.id, crmEngagements.leadId))
      .leftJoin(clientOwner, eq(clientOwner.id, crmEngagements.clientOwnerId))
      .where(eq(crmEngagements.id, engagement.id)),
    engagement.projectId
      ? db.select({ id: projects.id, name: projects.name, status: projects.status }).from(projects).where(eq(projects.id, engagement.projectId))
      : Promise.resolve([]),
    db.select({ id: crmProposals.id, title: crmProposals.title, version: crmProposals.currentVersion }).from(crmProposals).where(eq(crmProposals.id, engagement.proposalId)),
    db.select().from(crmCaseStudyDrafts).where(eq(crmCaseStudyDrafts.engagementId, engagement.id)),
  ]);
  return {
    ...engagement,
    ...(names[0] ?? { leadName: null, clientOwnerName: null }),
    opportunity: { id: opportunity.id, title: opportunity.title },
    organization: { id: org.id, name: org.name },
    project: project[0] ?? null,
    proposal: proposal[0] ?? null,
    caseStudyDraft: draft[0] ?? null,
    missing: closeoutMissing(engagement),
    access: access satisfies CrmAccess,
  };
}

export async function updateCloseout(engagement: Engagement, body: Closeout) {
  if (engagement.status === 'closed') conflict('engagement_closed');
  const changes: Partial<typeof crmEngagements.$inferInsert> = {};
  if (body.deliverablesAccepted !== undefined) changes.deliverablesAccepted = body.deliverablesAccepted;
  if (body.filesArchived !== undefined) changes.filesArchived = body.filesArchived;
  if (body.knowledgeTransferDone !== undefined) changes.knowledgeTransferDone = body.knowledgeTransferDone;
  if (body.clientFeedback !== undefined) changes.clientFeedback = body.clientFeedback || null;
  if (body.caseStudyConsent !== undefined) changes.caseStudyConsent = body.caseStudyConsent;
  if (!Object.keys(changes).length) badRequest('nothing_to_change');
  await db.update(crmEngagements).set({ ...changes, updatedAt: sql`datetime('now')` }).where(eq(crmEngagements.id, engagement.id));
}

/**
 * Close a completed engagement. With the client's case-study consent this adds
 * an internal draft built from the accepted proposal; nothing is published, and
 * the public case_studies table is never touched here.
 */
export async function closeEngagement(actor: Principal, loaded: Awaited<ReturnType<typeof loadEngagement>>) {
  const { engagement, org } = loaded;
  if (engagement.status === 'closed') conflict('engagement_closed');
  const missing = closeoutMissing(engagement);
  if (missing.length) badRequest('closeout_incomplete');
  const [accepted] = await db
    .select({ objectives: crmProposalVersions.objectives, scope: crmProposalVersions.scope })
    .from(crmProposalVersions)
    .innerJoin(crmProposals, eq(crmProposals.id, crmProposalVersions.proposalId))
    .where(and(eq(crmProposals.id, engagement.proposalId), eq(crmProposalVersions.version, crmProposals.currentVersion)));
  const draftId = engagement.caseStudyConsent ? crypto.randomUUID() : null;
  await db.batch([
    db
      .update(crmEngagements)
      .set({ status: 'closed', closedAt: sql`datetime('now')`, updatedAt: sql`datetime('now')` })
      .where(and(eq(crmEngagements.id, engagement.id), eq(crmEngagements.status, 'active'))),
    db
      .update(crmOrganizations)
      .set({ lifecycle: 'past_client', updatedAt: sql`datetime('now')` })
      .where(and(eq(crmOrganizations.id, org.id), eq(crmOrganizations.lifecycle, 'active_client'))),
    ...(draftId
      ? [
          db.insert(crmCaseStudyDrafts).values({
            id: draftId,
            engagementId: engagement.id,
            title: `${org.name}: ${loaded.opportunity.title}`,
            summary: accepted?.objectives || accepted?.scope || '',
            createdBy: actor.person.id,
          }),
        ]
      : []),
  ]);
  return { closed: true, caseStudyDraftId: draftId };
}
