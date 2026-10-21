import { accessReviews } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePermission } from '../../../../src/server/guard';
import { badRequest, forbidden, idParam, notFound } from '../../../../src/server/http';
import { sqlNow } from '../../../../src/server/status-history';

/** Mark an access review done. Access itself is edited through PUT /api/people/:id/access; nobody closes their own review. */
export const POST = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'people.grants');
  const [review] = await db.select().from(accessReviews).where(eq(accessReviews.id, idParam(c)));
  if (!review) notFound('access_review_not_found');
  if (review.personId === actor.person.id) forbidden('cannot_review_own_access');
  if (review.status !== 'open') badRequest('access_review_closed');
  await db
    .update(accessReviews)
    .set({ status: 'reviewed', reviewedBy: actor.person.id, reviewedAt: sqlNow() })
    .where(and(eq(accessReviews.id, review.id), eq(accessReviews.status, 'open')));
  await audit(actor.person.id, 'access_review.close', 'person', review.personId, { reviewId: review.id });
  return { id: review.id, status: 'reviewed' as const };
});
