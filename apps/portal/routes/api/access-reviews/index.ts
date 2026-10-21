import { accessReviews, people } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, desc, eq } from 'void/db';
import { ACCESS_REVIEW_STATUSES } from '../../../db/schema/lifecycle';
import { requirePermission } from '../../../src/server/guard';
import { id } from '../../../src/server/validation';

/** Access reviews raised by title changes, newest first (people.grants). */
export const GET = defineHandler.withValidator({
  query: v.object({ status: v.optional(v.picklist(ACCESS_REVIEW_STATUSES)), person: v.optional(id) }),
})(async (c, { query }) => {
  await requirePermission(c, 'people.grants');
  const where = [];
  if (query.status) where.push(eq(accessReviews.status, query.status));
  if (query.person) where.push(eq(accessReviews.personId, query.person));
  return db
    .select({
      id: accessReviews.id,
      personId: accessReviews.personId,
      personName: people.fullName,
      sourceType: accessReviews.sourceType,
      sourceId: accessReviews.sourceId,
      note: accessReviews.note,
      status: accessReviews.status,
      reviewedBy: accessReviews.reviewedBy,
      reviewedAt: accessReviews.reviewedAt,
      createdAt: accessReviews.createdAt,
    })
    .from(accessReviews)
    .innerJoin(people, eq(people.id, accessReviews.personId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(accessReviews.createdAt))
    .limit(500);
});
