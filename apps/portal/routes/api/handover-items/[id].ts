import { boardHandoverItems, people } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../src/server/audit';
import { requirePermission, requirePrincipal } from '../../../src/server/guard';
import { badRequest, forbidden, idParam, notFound } from '../../../src/server/http';
import { can } from '../../../src/server/permissions';
import { sqlNow } from '../../../src/server/status-history';
import { id, singleLine } from '../../../src/server/validation';

async function itemOr404(itemId: string) {
  const [item] = await db.select().from(boardHandoverItems).where(eq(boardHandoverItems.id, itemId));
  if (!item) notFound('handover_item_not_found');
  return item;
}

/** Tick an item (its owner or terms.manage); retitle or reassign it (terms.manage). */
export const PATCH = defineHandler.withValidator({
  body: v.object({ done: v.optional(v.boolean()), title: v.optional(singleLine(200)), ownerPersonId: v.optional(v.nullable(id)) }),
})(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const item = await itemOr404(idParam(c));
  const manager = can(actor.permissions, 'terms.manage');
  if (!manager && item.ownerPersonId !== actor.person.id) notFound('handover_item_not_found');
  if (!manager && (body.title !== undefined || body.ownerPersonId !== undefined)) forbidden();
  if (body.done === undefined && body.title === undefined && body.ownerPersonId === undefined) badRequest('nothing_to_update');
  if (body.ownerPersonId) {
    const [owner] = await db.select({ id: people.id }).from(people).where(eq(people.id, body.ownerPersonId));
    if (!owner) badRequest('unknown_person');
  }
  const doneChange = body.done === undefined ? {} : body.done ? { done: true, doneAt: sqlNow(), doneBy: actor.person.id } : { done: false, doneAt: null, doneBy: null };
  const [updated] = await db
    .update(boardHandoverItems)
    .set({ ...doneChange, ...(body.title !== undefined ? { title: body.title } : {}), ...(body.ownerPersonId !== undefined ? { ownerPersonId: body.ownerPersonId } : {}) })
    .where(eq(boardHandoverItems.id, item.id))
    .returning();
  await audit(actor.person.id, 'handover.update', 'term', item.termId, { itemId: item.id, fields: Object.keys(body) });
  return updated;
});

export const DELETE = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'terms.manage');
  const item = await itemOr404(idParam(c));
  await db.delete(boardHandoverItems).where(eq(boardHandoverItems.id, item.id));
  await audit(actor.person.id, 'handover.remove', 'term', item.termId, { itemId: item.id, title: item.title });
  return { id: item.id };
});
