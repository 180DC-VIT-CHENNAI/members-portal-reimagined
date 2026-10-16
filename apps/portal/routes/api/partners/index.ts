import { partners } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../src/server/audit';
import { linkUrl } from '../../../src/server/content';
import { requirePermission } from '../../../src/server/guard';

export const POST = defineHandler.withValidator({
  body: v.object({
    name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
    logoUrl: linkUrl,
    websiteUrl: linkUrl,
    sortOrder: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000)), 100),
  }),
})(async (c, { body }) => {
  const actor = await requirePermission(c, 'content.manage');
  const id = crypto.randomUUID();
  await db.insert(partners).values({ id, ...body, logoUrl: body.logoUrl ?? null, websiteUrl: body.websiteUrl ?? null });
  await audit(actor.person.id, 'partner.create', 'partner', id, { name: body.name });
  return c.json({ id }, 201);
});
