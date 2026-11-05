import { accessReviews, auditLog, emailQueue, people, promotionDecisions, promotionProposals } from '@schema';
import { HTTPException } from 'hono/http-exception';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { sender } from '../../../../src/server/email/sender';
import { requirePrincipal } from '../../../../src/server/guard';
import { badRequest, conflict, idParam } from '../../../../src/server/http';
import { isUniqueViolation } from '../../../../src/server/invitations';
import { documentFor } from '../../../../src/server/letters/access';
import { hasAccess } from '../../../../src/server/lifecycle';
import { decidePromotion } from '../../../../src/server/promotion-rules';
import { PROMOTION_SUBJECT, promotionHtml, proposalOr404 } from '../../../../src/server/promotions';
import { sqlNow } from '../../../../src/server/status-history';
import { activePositionOr400, assertNoTenure, tenureInsert } from '../../../../src/server/tenures';
import { id } from '../../../../src/server/validation';

/**
 * Approve, reject or withdraw a pending proposal. Approval (by someone other
 * than the proposer and the person concerned, holding
 * people.promotions.approve for the position) writes in one batch: the
 * tenure, the decision, an open access review, the notification campaign and
 * the audit entry. Access roles and grants are never touched; the tenure's
 * unique index makes a racing second approval fail as a whole.
 */
export const POST = defineHandler.withValidator({
  body: v.object({
    action: v.picklist(['approve', 'reject', 'withdraw']),
    note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(1000))),
    letterDocumentId: v.optional(v.nullable(id)),
  }),
})(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const { row, mayApprove } = await proposalOr404(actor, idParam(c));
  const decision = decidePromotion({
    status: row.status,
    proposedBy: row.proposedBy,
    personId: row.personId,
    actorId: actor.person.id,
    actorMayApprove: mayApprove,
    action: body.action,
  });
  if (!decision.ok) throw new HTTPException(decision.httpStatus, { message: decision.error });

  const decided = { status: decision.status, decidedBy: actor.person.id, decidedAt: sqlNow(), decisionNote: body.note || null };
  const claim = db.insert(promotionDecisions).values({ proposalId: row.id, actorPersonId: actor.person.id, action: body.action, note: body.note ?? null });
  const stillPending = and(eq(promotionProposals.id, row.id), eq(promotionProposals.status, 'pending'));
  try {
  if (decision.status !== 'approved') {
    await db.batch([
      claim,
      db.update(promotionProposals).set(decided).where(stillPending),
      db.insert(auditLog).values({ actorPersonId: actor.person.id, action: `promotion.${body.action}`, targetType: 'person', targetId: row.personId, details: { proposalId: row.id } }),
    ]);
    return { id: row.id, status: decision.status, tenureId: null };
  }

  if (!hasAccess(row.personStatus) && row.personStatus !== 'invited') badRequest('person_inactive');
  await activePositionOr400(row.positionId);
  await assertNoTenure(row.personId, row.positionId, row.termId);
  const letterDocumentId = body.letterDocumentId ?? row.letterDocumentId;
  if (body.letterDocumentId) await documentFor(actor, body.letterDocumentId);
  const [person] = await db.select({ accessRoleId: people.accessRoleId }).from(people).where(eq(people.id, row.personId));

  const tenureId = crypto.randomUUID();
  const campaignId = crypto.randomUUID();
  const recipients = [row.personEmail];
  await db.batch([
    claim,
    tenureInsert({ id: tenureId, personId: row.personId, positionId: row.positionId, termId: row.termId, startedOn: row.startsOn }),
    db.update(promotionProposals).set({ ...decided, tenureId, letterDocumentId }).where(stillPending),
    db.insert(accessReviews).values({
      id: crypto.randomUUID(),
      personId: row.personId,
      sourceType: 'promotion',
      sourceId: row.id,
      note: `Now ${row.positionTitle} (${row.termLabel}). Access is unchanged: role "${person?.accessRoleId ?? 'unknown'}" and personal grants were not modified. Review whether they should change.`,
    }),
    db.insert(emailQueue).values({
      id: campaignId,
      kind: 'promotion',
      fromAddress: sender('180DC VIT Chennai'),
      subject: PROMOTION_SUBJECT,
      html: promotionHtml({ fullName: row.personName, title: row.positionTitle, termLabel: row.termLabel, startsOn: row.startsOn }),
      recipients,
      total: recipients.length,
      status: 'pending',
      createdBy: actor.person.id,
      meta: { proposalId: row.id, personId: row.personId, replyTo: actor.person.email },
    }),
    db.insert(auditLog).values({
      actorPersonId: actor.person.id,
      action: 'promotion.approve',
      targetType: 'person',
      targetId: row.personId,
      details: { proposalId: row.id, tenureId, positionId: row.positionId, termId: row.termId, campaignId, letterDocumentId, accessChanged: false },
    }),
  ]);
  return { id: row.id, status: decision.status, tenureId };
  } catch (error) {
    if (isUniqueViolation(error)) conflict('proposal_already_decided_or_tenure_exists');
    throw error;
  }
});
