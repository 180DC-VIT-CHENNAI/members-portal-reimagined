import { crmContacts, crmEngagements, crmOpportunities, crmOrganizations, crmProposals, crmProposalVersions, crmStages, crmTouchpoints, people } from '@schema';
import { and, asc, db, desc, eq, inArray, lte, sql } from 'void/db';
import { badRequest } from '../http';
import type { Principal } from '../principal';
import { contactAccess, contactView, type CrmAccess, type Opportunity, type Organization, organizationAccess, visibleOpportunities } from './access';
import { stageMove } from './rules';

export const listStages = () => db.select().from(crmStages).orderBy(asc(crmStages.sortOrder), asc(crmStages.id));

/** The first active open stage, where new opportunities start. */
export async function firstStageId(): Promise<string> {
  const [first] = await db
    .select({ id: crmStages.id })
    .from(crmStages)
    .where(and(eq(crmStages.kind, 'open'), eq(crmStages.active, true)))
    .orderBy(asc(crmStages.sortOrder))
    .limit(1);
  if (!first) badRequest('no_open_stage');
  return first.id;
}

export async function stageOfKind(kind: 'won' | 'lost'): Promise<string> {
  const [stage] = await db.select({ id: crmStages.id }).from(crmStages).where(eq(crmStages.kind, kind)).limit(1);
  if (!stage) badRequest('stage_missing');
  return stage.id;
}

/** Opportunities the caller can see, optionally matched by title or organisation, newest first. */
export async function listOpportunities(principal: Principal, q?: string) {
  const needle = q ? `%${q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  return db
    .select({
      id: crmOpportunities.id,
      title: crmOpportunities.title,
      organizationId: crmOpportunities.organizationId,
      organizationName: crmOrganizations.name,
      stageId: crmOpportunities.stageId,
      priority: crmOpportunities.priority,
      ownerId: crmOpportunities.ownerId,
      ownerName: people.fullName,
      nextAction: crmOpportunities.nextAction,
      nextActionDue: crmOpportunities.nextActionDue,
      lostReason: crmOpportunities.lostReason,
      updatedAt: crmOpportunities.updatedAt,
    })
    .from(crmOpportunities)
    .innerJoin(crmOrganizations, eq(crmOrganizations.id, crmOpportunities.organizationId))
    .leftJoin(people, eq(people.id, crmOpportunities.ownerId))
    .where(
      and(
        visibleOpportunities(principal),
        needle ? sql`(lower(${crmOpportunities.title}) like ${needle} escape '\\' or lower(${crmOrganizations.name}) like ${needle} escape '\\')` : undefined,
      ),
    )
    .orderBy(desc(crmOpportunities.updatedAt), desc(crmOpportunities.id))
    .limit(500);
}

/** How many visible opportunities sit in each stage. */
export async function pipelineCounts(principal: Principal) {
  const rows = await db
    .select({ stageId: crmOpportunities.stageId, count: sql<number>`count(*)` })
    .from(crmOpportunities)
    .where(visibleOpportunities(principal))
    .groupBy(crmOpportunities.stageId);
  return Object.fromEntries(rows.map((row) => [row.stageId, row.count]));
}

/** The caller's own open opportunities whose next step is due today or earlier (UTC). */
export async function myNextSteps(principal: Principal, today: string) {
  const rows = await db
    .select({
      id: crmOpportunities.id,
      title: crmOpportunities.title,
      organizationName: crmOrganizations.name,
      nextAction: crmOpportunities.nextAction,
      nextActionDue: crmOpportunities.nextActionDue,
      stageLabel: crmStages.label,
    })
    .from(crmOpportunities)
    .innerJoin(crmOrganizations, eq(crmOrganizations.id, crmOpportunities.organizationId))
    .innerJoin(crmStages, eq(crmStages.id, crmOpportunities.stageId))
    .where(and(eq(crmOpportunities.ownerId, principal.person.id), eq(crmStages.kind, 'open'), lte(crmOpportunities.nextActionDue, today)))
    .orderBy(asc(crmOpportunities.nextActionDue), asc(crmOpportunities.id));
  return rows.map((row) => ({ ...row, overdue: row.nextActionDue !== null && row.nextActionDue < today }));
}

/** Move an opportunity to another stage, enforcing reason codes and the won/lost rules. */
export async function moveStage(opportunity: Opportunity, body: { stageId: string; lostReason?: Opportunity['lostReason']; lostNote?: string | null }) {
  const stages = await db.select().from(crmStages).where(inArray(crmStages.id, [opportunity.stageId, body.stageId]));
  const from = stages.find((stage) => stage.id === opportunity.stageId);
  const to = stages.find((stage) => stage.id === body.stageId);
  if (!from || !to) badRequest('unknown_stage');
  const move = stageMove(from, to, body.lostReason);
  if (!move.ok) badRequest(move.error);
  await db
    .update(crmOpportunities)
    .set({
      stageId: to.id,
      lostReason: move.lostReason,
      lostNote: move.lostReason ? body.lostNote || null : null,
      closedAt: move.closed ? sql`datetime('now')` : null,
      updatedAt: sql`datetime('now')`,
    })
    .where(eq(crmOpportunities.id, opportunity.id));
  return { from: from.id, to: to.id, lostReason: move.lostReason };
}

/** An opportunity with its organisation, contact, touchpoints, proposals and engagement, as the caller may see them. */
export async function opportunityDetail(principal: Principal, opportunity: Opportunity, org: Organization, access: CrmAccess) {
  const [orgAccess, stage, owner, contactRows, touchpoints, proposals, versions, engagement] = await Promise.all([
    organizationAccess(principal, org),
    db.select().from(crmStages).where(eq(crmStages.id, opportunity.stageId)),
    opportunity.ownerId ? db.select({ id: people.id, fullName: people.fullName }).from(people).where(eq(people.id, opportunity.ownerId)) : Promise.resolve([]),
    opportunity.primaryContactId ? db.select().from(crmContacts).where(eq(crmContacts.id, opportunity.primaryContactId)) : Promise.resolve([]),
    db.select().from(crmTouchpoints).where(eq(crmTouchpoints.opportunityId, opportunity.id)).orderBy(desc(crmTouchpoints.occurredAt)).limit(100),
    db.select().from(crmProposals).where(eq(crmProposals.opportunityId, opportunity.id)).orderBy(desc(crmProposals.createdAt)),
    db
      .select()
      .from(crmProposalVersions)
      .where(inArray(crmProposalVersions.proposalId, db.select({ id: crmProposals.id }).from(crmProposals).where(eq(crmProposals.opportunityId, opportunity.id))))
      .orderBy(desc(crmProposalVersions.version)),
    db.select({ id: crmEngagements.id, status: crmEngagements.status, projectId: crmEngagements.projectId }).from(crmEngagements).where(eq(crmEngagements.opportunityId, opportunity.id)),
  ]);
  const contact = contactRows[0];
  const contactPrivate = contact ? access.private || (await contactAccess(principal, contact, org)).private : false;
  return {
    ...opportunity,
    organization: { id: org.id, name: org.name, canOpen: orgAccess.view },
    stage: stage[0] ?? null,
    owner: owner[0] ?? null,
    primaryContact: contact ? contactView(contact, contactPrivate) : null,
    touchpoints,
    proposals: proposals.map((proposal) => ({
      ...proposal,
      versions: versions.filter((version) => version.proposalId === proposal.id),
    })),
    engagement: engagement[0] ?? null,
    access,
  };
}
