import { departments, positions } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, asc, db, eq, isNull } from 'void/db';
import { audit } from '../../../src/server/audit';
import { requirePermission, requirePrincipal } from '../../../src/server/guard';
import { badRequest, conflict } from '../../../src/server/http';
import { id } from '../../../src/server/validation';

export const GET = defineHandler(async (c) => {
  await requirePrincipal(c);
  return db.select().from(positions).orderBy(asc(positions.rank), asc(positions.title));
});

/** Create a title. departmentId null makes a club-wide position. */
export const POST = defineHandler.withValidator({
  body: v.object({
    title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
    departmentId: v.nullable(id),
    rank: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000)), 100),
  }),
})(async (c, { body }) => {
  const actor = await requirePermission(c, 'positions.manage', body.departmentId);
  if (body.departmentId) {
    const [dept] = await db.select().from(departments).where(eq(departments.id, body.departmentId));
    if (!dept) badRequest('unknown_department');
  }
  const [dupe] = await db
    .select({ id: positions.id })
    .from(positions)
    .where(
      and(
        eq(positions.title, body.title),
        body.departmentId ? eq(positions.departmentId, body.departmentId) : isNull(positions.departmentId),
      ),
    );
  if (dupe) conflict('position_exists');
  const positionId = crypto.randomUUID();
  await db.insert(positions).values({ id: positionId, ...body });
  await audit(actor.person.id, 'position.create', 'position', positionId, body);
  return c.json({ id: positionId }, 201);
});
