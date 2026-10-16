import { positions } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../src/server/audit';
import { requirePermission } from '../../../src/server/guard';
import { badRequest, idParam, notFound } from '../../../src/server/http';

/** Rename, re-rank or retire a position. Retired positions keep their history. */
export const PATCH = defineHandler.withValidator({
  body: v.object({
    title: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100))),
    rank: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000))),
    active: v.optional(v.boolean()),
  }),
})(async (c, { body }) => {
  const [position] = await db.select().from(positions).where(eq(positions.id, idParam(c)));
  if (!position) notFound('position_not_found');
  const actor = requirePermission(c, 'positions.manage', position.departmentId);
  if (Object.keys(body).length === 0) badRequest('nothing_to_update');
  const [updated] = await db.update(positions).set(body).where(eq(positions.id, position.id)).returning();
  await audit(actor.person.id, 'position.update', 'position', position.id, body);
  return updated;
});
