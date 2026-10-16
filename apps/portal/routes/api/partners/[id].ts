import { partners } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../src/server/audit';
import { linkUrl } from '../../../src/server/content';
import { requirePermission } from '../../../src/server/guard';
import { badRequest, idParam, notFound } from '../../../src/server/http';

export const PATCH = defineHandler.withValidator({
  body: v.object({
    name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120))),
    logoUrl: linkUrl,
    websiteUrl: linkUrl,
    sortOrder: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000))),
  }),
})(async (c, { body }) => {
  const actor = await requirePermission(c, 'content.manage');
  if (Object.keys(body).length === 0) badRequest('nothing_to_update');
  const [updated] = await db.update(partners).set(body).where(eq(partners.id, idParam(c))).returning();
  if (!updated) notFound('partner_not_found');
  await audit(actor.person.id, 'partner.update', 'partner', updated.id, body);
  return updated;
});

export const DELETE = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'content.manage');
  const [removed] = await db.delete(partners).where(eq(partners.id, idParam(c))).returning({ id: partners.id, name: partners.name });
  if (!removed) notFound('partner_not_found');
  await audit(actor.person.id, 'partner.delete', 'partner', removed.id, { name: removed.name });
  return null;
});
