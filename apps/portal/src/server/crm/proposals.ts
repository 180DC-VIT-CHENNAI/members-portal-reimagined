import {
  crmEngagements,
  crmOpportunities,
  crmOrganizations,
  crmProposals,
  crmProposalVersions,
  crmRecordAccess,
  projectDepartments,
  projectMembers,
  projects,
} from '@schema';
import type * as v from 'valibot';
import { and, db, eq, isNull, sql } from 'void/db';
import { badRequest, conflict, forbidden, notFound } from '../http';
import { loadPersonPrincipal, type Principal } from '../principal';
import { projectAccess } from '../project-rules';
import { requireKnown } from '../projects';
import { type Opportunity, opportunityAccess, type Organization } from './access';
import type { acceptFields, proposalContent } from './fields';
import { canMoveProposal, canReviseProposal } from './rules';
import { stageOfKind } from './pipeline';

export type Proposal = typeof crmProposals.$inferSelect;
type Content = v.InferOutput<v.ObjectSchema<typeof proposalContent, undefined>>;
type Accept = v.InferOutput<typeof acceptFields>;

/** A proposal with its opportunity and the caller's rights there; 404 when either is hidden from them. */
export async function proposalFor(principal: Principal, id: string) {
  const [row] = await db
    .select({ proposal: crmProposals, opportunity: crmOpportunities, org: crmOrganizations })
    .from(crmProposals)
    .innerJoin(crmOpportunities, eq(crmOpportunities.id, crmProposals.opportunityId))
    .innerJoin(crmOrganizations, eq(crmOrganizations.id, crmOpportunities.organizationId))
    .where(eq(crmProposals.id, id));
  if (!row) notFound('proposal_not_found');
  const access = await opportunityAccess(principal, row.opportunity, row.org);
  if (!access.view) notFound('proposal_not_found');
  return { ...row, access };
}

export async function createProposal(actor: Principal, opportunity: Opportunity, title: string, content: Content) {
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(crmProposals).values({ id, opportunityId: opportunity.id, title, createdBy: actor.person.id }),
    db.insert(crmProposalVersions).values({ id: crypto.randomUUID(), proposalId: id, version: 1, ...content, createdBy: actor.person.id }),
  ]);
  return id;
}

/** Write the next version; every earlier version is frozen and the proposal returns to draft. */
export async function reviseProposal(actor: Principal, proposal: Proposal, content: Content) {
  if (!canReviseProposal(proposal.status)) conflict('proposal_decided');
  const version = proposal.currentVersion + 1;
  await db.batch([
    db
      .update(crmProposalVersions)
      .set({ frozenAt: sql`datetime('now')` })
      .where(and(eq(crmProposalVersions.proposalId, proposal.id), isNull(crmProposalVersions.frozenAt))),
    db.insert(crmProposalVersions).values({ id: crypto.randomUUID(), proposalId: proposal.id, version, ...content, createdBy: actor.person.id }),
    db.update(crmProposals).set({ currentVersion: version, status: 'draft', updatedAt: sql`datetime('now')` }).where(eq(crmProposals.id, proposal.id)),
  ]);
  return version;
}

/** Mark a proposal sent (freezing its current version) or declined. */
export async function setProposalStatus(proposal: Proposal, status: 'sent' | 'declined') {
  if (!canMoveProposal(proposal.status, status)) conflict('invalid_proposal_transition');
  const [updated] = await db.batch([
    db
      .update(crmProposals)
      .set({ status, decidedAt: status === 'declined' ? sql`datetime('now')` : null, updatedAt: sql`datetime('now')` })
      .where(and(eq(crmProposals.id, proposal.id), eq(crmProposals.status, proposal.status)))
      .returning({ id: crmProposals.id }),
    db
      .update(crmProposalVersions)
      .set({ frozenAt: sql`datetime('now')` })
      .where(and(eq(crmProposalVersions.proposalId, proposal.id), isNull(crmProposalVersions.frozenAt))),
  ]);
  if (!updated.length) conflict('invalid_proposal_transition');
}

/**
 * Accept a sent proposal: it becomes the opportunity's engagement, linked to a
 * new canonical project in the chosen departments, and the opportunity is won.
 * Creating the project needs the same right as creating one directly. The
 * project only names the client for standard-confidentiality work.
 */
export async function acceptProposal(actor: Principal, proposal: Proposal, opportunity: Opportunity, org: Organization, body: Accept) {
  if (!canMoveProposal(proposal.status, 'accepted')) conflict('invalid_proposal_transition');
  const departmentIds = [...new Set(body.departmentIds)];
  if (!projectAccess(actor.permissions, departmentIds, false, false).manage) forbidden();
  await requireKnown(departmentIds, null);
  const lead = await loadPersonPrincipal(body.leadId);
  if (!lead) badRequest('person_without_access');
  const [existing] = await db.select({ id: crmEngagements.id }).from(crmEngagements).where(eq(crmEngagements.opportunityId, opportunity.id));
  if (existing) conflict('already_engaged');

  const confidentiality = body.confidentiality ?? 'confidential';
  const projectId = crypto.randomUUID();
  const engagementId = crypto.randomUUID();
  const clientOwnerId = opportunity.ownerId ?? actor.person.id;
  const wonStage = await stageOfKind('won');
  const people = [{ personId: lead.person.id, role: 'Engagement lead' }];
  if (clientOwnerId !== lead.person.id) people.push({ personId: clientOwnerId, role: 'Client owner' });
  try {
    await db.batch([
      db
        .update(crmProposals)
        .set({ status: 'accepted', decidedAt: sql`datetime('now')`, updatedAt: sql`datetime('now')` })
        .where(and(eq(crmProposals.id, proposal.id), eq(crmProposals.status, 'sent'))),
      db.update(crmProposalVersions).set({ frozenAt: sql`datetime('now')` }).where(and(eq(crmProposalVersions.proposalId, proposal.id), isNull(crmProposalVersions.frozenAt))),
      db.insert(projects).values({
        id: projectId,
        name: opportunity.title,
        client: confidentiality === 'standard' ? org.name : null,
        deadline: body.deadline ?? null,
        internal: false,
        status: 'active',
        createdBy: actor.person.id,
      }),
      ...departmentIds.map((departmentId) => db.insert(projectDepartments).values({ projectId, departmentId })),
      ...people.map((member) => db.insert(projectMembers).values({ id: crypto.randomUUID(), projectId, ...member, createdBy: actor.person.id })),
      db.insert(crmEngagements).values({
        id: engagementId,
        opportunityId: opportunity.id,
        proposalId: proposal.id,
        projectId,
        clientOwnerId,
        leadId: lead.person.id,
        confidentiality,
        createdBy: actor.person.id,
      }),
      db
        .update(crmOpportunities)
        .set({ stageId: wonStage, lostReason: null, lostNote: null, closedAt: sql`datetime('now')`, updatedAt: sql`datetime('now')` })
        .where(eq(crmOpportunities.id, opportunity.id)),
      db.update(crmOrganizations).set({ lifecycle: 'active_client', updatedAt: sql`datetime('now')` }).where(eq(crmOrganizations.id, org.id)),
      db
        .insert(crmRecordAccess)
        .values({ id: crypto.randomUUID(), recordType: 'opportunity', recordId: opportunity.id, personId: lead.person.id, role: 'collaborator', createdBy: actor.person.id })
        .onConflictDoNothing(),
    ]);
  } catch (err) {
    const [raced] = await db.select({ id: crmEngagements.id }).from(crmEngagements).where(eq(crmEngagements.opportunityId, opportunity.id));
    if (raced) conflict('already_engaged');
    throw err;
  }
  return { engagementId, projectId };
}
