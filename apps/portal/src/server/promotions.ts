import { people, positions, promotionProposals, terms } from '@schema';
import { alias } from 'drizzle-orm/sqlite-core';
import { db, desc, eq } from 'void/db';
import { escapeHtml } from './html';
import { notFound } from './http';
import { can } from './permissions';
import type { Principal } from './principal';

const proposer = alias(people, 'proposer');

/** Department the approval permission must cover: the position's own; club-wide positions need a global grant. */
export function approvalScope(positionDepartmentId: string | null): string | null {
  return positionDepartmentId;
}

/** Department people.edit must cover to propose (same rule as adding a tenure by hand). */
export function proposalScope(positionDepartmentId: string | null, personDepartmentId: string | null): string | null {
  return positionDepartmentId ?? personDepartmentId;
}

function proposalRows() {
  return db
    .select({
      id: promotionProposals.id,
      personId: promotionProposals.personId,
      personName: people.fullName,
      personEmail: people.email,
      personStatus: people.status,
      personDepartmentId: people.departmentId,
      positionId: promotionProposals.positionId,
      positionTitle: positions.title,
      positionDepartmentId: positions.departmentId,
      termId: promotionProposals.termId,
      termLabel: terms.label,
      startsOn: promotionProposals.startsOn,
      rationale: promotionProposals.rationale,
      letterDocumentId: promotionProposals.letterDocumentId,
      status: promotionProposals.status,
      proposedBy: promotionProposals.proposedBy,
      proposedByName: proposer.fullName,
      decidedBy: promotionProposals.decidedBy,
      decidedAt: promotionProposals.decidedAt,
      decisionNote: promotionProposals.decisionNote,
      tenureId: promotionProposals.tenureId,
      createdAt: promotionProposals.createdAt,
    })
    .from(promotionProposals)
    .innerJoin(people, eq(people.id, promotionProposals.personId))
    .innerJoin(proposer, eq(proposer.id, promotionProposals.proposedBy))
    .innerJoin(positions, eq(positions.id, promotionProposals.positionId))
    .innerJoin(terms, eq(terms.id, promotionProposals.termId));
}

export type ProposalRow = Awaited<ReturnType<typeof proposalRows>>[number];

function mayApprove(viewer: Principal, row: ProposalRow): boolean {
  return can(viewer.permissions, 'people.promotions.approve', approvalScope(row.positionDepartmentId));
}

/** Proposals are visible to the person concerned, their proposer, and people who could propose or approve them. */
function mayView(viewer: Principal, row: ProposalRow): boolean {
  return (
    row.personId === viewer.person.id ||
    row.proposedBy === viewer.person.id ||
    can(viewer.permissions, 'people.edit', proposalScope(row.positionDepartmentId, row.personDepartmentId)) ||
    mayApprove(viewer, row)
  );
}

/** The row plus what the viewer may do with it. */
function present(viewer: Principal, row: ProposalRow) {
  const { personEmail: _email, ...rest } = row;
  const deciding = row.status === 'pending' && row.proposedBy !== viewer.person.id && row.personId !== viewer.person.id;
  return { ...rest, canDecide: deciding && mayApprove(viewer, row), canWithdraw: row.status === 'pending' && row.proposedBy === viewer.person.id };
}

export async function listProposals(viewer: Principal, filter: { personId?: string; status?: ProposalRow['status'] }) {
  const rows = await proposalRows().orderBy(desc(promotionProposals.createdAt)).limit(500);
  return rows
    .filter((row) => (!filter.personId || row.personId === filter.personId) && (!filter.status || row.status === filter.status))
    .filter((row) => mayView(viewer, row))
    .map((row) => present(viewer, row));
}

/** One proposal the viewer may see, or 404 (no existence leak). */
export async function proposalOr404(viewer: Principal, id: string) {
  const [row] = await proposalRows().where(eq(promotionProposals.id, id));
  if (!row || !mayView(viewer, row)) notFound('proposal_not_found');
  return { row, view: present(viewer, row), mayApprove: mayApprove(viewer, row) };
}

export const PROMOTION_SUBJECT = 'Your new position at 180DC VIT Chennai';

export function promotionHtml(input: { fullName: string; title: string; termLabel: string; startsOn: string }): string {
  return [
    `<p>Hi ${escapeHtml(input.fullName)},</p>`,
    `<p>You have been appointed <strong>${escapeHtml(input.title)}</strong> for the ${escapeHtml(input.termLabel)} term, from ${escapeHtml(input.startsOn)}.</p>`,
    '<p>Your portal access has not changed. Any change to what you can do in the portal is reviewed separately.</p>',
  ].join('\n');
}
