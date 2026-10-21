import { boardHandoverItems, people, terms } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, asc, db, eq } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePermission, requirePrincipal } from '../../../../src/server/guard';
import { badRequest, idParam, notFound } from '../../../../src/server/http';
import { can } from '../../../../src/server/permissions';
import { id, singleLine } from '../../../../src/server/validation';

async function termOr404(termId: string) {
  const [term] = await db.select().from(terms).where(eq(terms.id, termId));
  if (!term) notFound('term_not_found');
  return term;
}

/**
 * The incoming board's handover checklist for a term. terms.manage sees every
 * item; anyone else sees only the items they own.
 */
export const GET = defineHandler(async (c) => {
  const viewer = await requirePrincipal(c);
  const term = await termOr404(idParam(c));
  const manager = can(viewer.permissions, 'terms.manage');
  const items = await db
    .select({
      id: boardHandoverItems.id,
      title: boardHandoverItems.title,
      ownerPersonId: boardHandoverItems.ownerPersonId,
      ownerName: people.fullName,
      done: boardHandoverItems.done,
      doneAt: boardHandoverItems.doneAt,
      createdAt: boardHandoverItems.createdAt,
    })
    .from(boardHandoverItems)
    .leftJoin(people, eq(people.id, boardHandoverItems.ownerPersonId))
    .where(manager ? eq(boardHandoverItems.termId, term.id) : and(eq(boardHandoverItems.termId, term.id), eq(boardHandoverItems.ownerPersonId, viewer.person.id)))
    .orderBy(asc(boardHandoverItems.createdAt));
  return { termId: term.id, canManage: manager, items };
});

/** Add a checklist item, optionally owned by someone (terms.manage). */
export const POST = defineHandler.withValidator({ body: v.object({ title: singleLine(200), ownerPersonId: v.optional(v.nullable(id)) }) })(async (c, { body }) => {
  const actor = await requirePermission(c, 'terms.manage');
  const term = await termOr404(idParam(c));
  if (body.ownerPersonId) {
    const [owner] = await db.select({ id: people.id }).from(people).where(eq(people.id, body.ownerPersonId));
    if (!owner) badRequest('unknown_person');
  }
  const itemId = crypto.randomUUID();
  await db.insert(boardHandoverItems).values({ id: itemId, termId: term.id, title: body.title, ownerPersonId: body.ownerPersonId ?? null, createdBy: actor.person.id });
  await audit(actor.person.id, 'handover.add', 'term', term.id, { itemId });
  return c.json({ id: itemId }, 201);
});
