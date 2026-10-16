import { people, tenures, terms } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, eq, inArray, isNull } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePermission } from '../../../../src/server/guard';
import { badRequest, idParam, notFound } from '../../../../src/server/http';
import { id } from '../../../../src/server/validation';

/**
 * Start a new term in one step: it becomes the current term, every open
 * tenure of the previous term ends the day before, and the listed people keep
 * their positions as new tenures in the new term. People listed in
 * `alumni` move to alumni status.
 */
export const POST = defineHandler.withValidator({
  body: v.object({
    carryOver: v.optional(v.pipe(v.array(id), v.maxLength(2000)), []),
    alumni: v.optional(v.pipe(v.array(id), v.maxLength(2000)), []),
  }),
})(async (c, { body }) => {
  const actor = requirePermission(c, 'terms.manage');
  const [next] = await db.select().from(terms).where(eq(terms.id, idParam(c)));
  if (!next) notFound('term_not_found');
  if (next.isCurrent) badRequest('term_already_current');
  const [previous] = await db.select().from(terms).where(eq(terms.isCurrent, true));

  const dayBefore = new Date(Date.parse(`${next.startsOn}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const open = previous
    ? await db
        .select()
        .from(tenures)
        .where(and(eq(tenures.termId, previous.id), isNull(tenures.endedOn)))
    : [];
  const carry = new Set(body.carryOver);
  const carried = open.filter((t) => carry.has(t.personId));
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  await db.batch([
    db.update(terms).set({ isCurrent: false }).where(eq(terms.isCurrent, true)),
    db.update(terms).set({ isCurrent: true }).where(eq(terms.id, next.id)),
    ...(previous ? [db.update(tenures).set({ endedOn: dayBefore }).where(and(eq(tenures.termId, previous.id), isNull(tenures.endedOn)))] : []),
    ...carried.map((t) =>
      db
        .insert(tenures)
        .values({ id: crypto.randomUUID(), personId: t.personId, positionId: t.positionId, termId: next.id, startedOn: next.startsOn })
        .onConflictDoNothing(),
    ),
    ...(body.alumni.length
      ? [
          db
            .update(people)
            .set({ status: 'alumni', statusChangedAt: now, updatedAt: now })
            .where(and(inArray(people.id, body.alumni), inArray(people.status, ['active', 'on_leave', 'invited']))),
        ]
      : []),
  ]);
  if (body.alumni.length) {
    const gone = await db.select({ authUserId: people.authUserId }).from(people).where(inArray(people.id, body.alumni));
    const userIds = gone.map((g) => g.authUserId).filter((u): u is string => u !== null);
    if (userIds.length) {
      await c.env.DB.prepare(`DELETE FROM session WHERE userId IN (${userIds.map(() => '?').join(',')})`)
        .bind(...userIds)
        .run();
    }
  }
  const summary = { previous: previous?.id ?? null, ended: open.length, carriedOver: carried.length, alumni: body.alumni.length };
  await audit(actor.person.id, 'term.start', 'term', next.id, summary);
  return { current: next.id, ...summary };
});
