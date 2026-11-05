import { promotionProposals } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { PROMOTION_STATUSES } from '../../../db/schema/lifecycle';
import { audit } from '../../../src/server/audit';
import { requirePrincipal } from '../../../src/server/guard';
import { badRequest, forbidden } from '../../../src/server/http';
import { documentFor } from '../../../src/server/letters/access';
import { getPersonOr404 } from '../../../src/server/people';
import { can } from '../../../src/server/permissions';
import { mayPropose } from '../../../src/server/promotion-rules';
import { listProposals, proposalScope } from '../../../src/server/promotions';
import { activePositionOr400, assertNoTenure, termOr400 } from '../../../src/server/tenures';
import { calendarDate, id } from '../../../src/server/validation';
import { hasAccess } from '../../../src/server/lifecycle';
import { todayIso } from '../../../src/server/status-history';

/** Promotion proposals the viewer may see, newest first. */
export const GET = defineHandler.withValidator({
  query: v.object({ person: v.optional(id), status: v.optional(v.picklist(PROMOTION_STATUSES)) }),
})(async (c, { query }) => {
  const viewer = await requirePrincipal(c);
  c.header('Cache-Control', 'private, no-store');
  return listProposals(viewer, { personId: query.person, status: query.status });
});

/**
 * Propose a position for someone (needs people.edit for it, like adding a
 * tenure). Nothing changes until a second person approves.
 */
export const POST = defineHandler.withValidator({
  body: v.object({
    personId: id,
    positionId: id,
    termId: v.optional(id),
    startsOn: v.optional(calendarDate),
    rationale: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
    letterDocumentId: v.optional(v.nullable(id)),
  }),
})(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const person = await getPersonOr404(body.personId);
  const position = await activePositionOr400(body.positionId);
  const allowed = mayPropose({
    proposerId: actor.person.id,
    personId: person.id,
    proposerMayEdit: can(actor.permissions, 'people.edit', proposalScope(position.departmentId, person.departmentId)),
  });
  if (!allowed.ok) (allowed.httpStatus === 403 ? forbidden : badRequest)(allowed.error);
  if (!hasAccess(person.status) && person.status !== 'invited') badRequest('person_inactive');
  const term = await termOr400(body.termId);
  await assertNoTenure(person.id, position.id, term.id);
  if (body.letterDocumentId) await documentFor(actor, body.letterDocumentId);

  const proposalId = crypto.randomUUID();
  await db.insert(promotionProposals).values({
    id: proposalId,
    personId: person.id,
    positionId: position.id,
    termId: term.id,
    startsOn: body.startsOn ?? (term.startsOn > todayIso() ? term.startsOn : todayIso()),
    rationale: body.rationale,
    letterDocumentId: body.letterDocumentId ?? null,
    proposedBy: actor.person.id,
  });
  await audit(actor.person.id, 'promotion.propose', 'person', person.id, { proposalId, positionId: position.id, termId: term.id });
  return c.json({ id: proposalId, status: 'pending' as const }, 201);
});
