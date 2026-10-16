import { terms } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, desc, eq } from 'void/db';
import { audit } from '../../../src/server/audit';
import { requirePermission, requirePrincipal } from '../../../src/server/guard';
import { badRequest, conflict } from '../../../src/server/http';
import { isoDate } from '../../../src/server/validation';

export const GET = defineHandler(async (c) => {
  await requirePrincipal(c);
  return db.select().from(terms).orderBy(desc(terms.startsOn));
});

/** Create an upcoming academic-year term, e.g. "2027-28". */
export const POST = defineHandler.withValidator({
  body: v.object({
    id: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}$/, 'term_id_format_yyyy-yy')),
    label: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40))),
    startsOn: isoDate,
    endsOn: isoDate,
  }),
})(async (c, { body }) => {
  const actor = await requirePermission(c, 'terms.manage');
  if (body.endsOn <= body.startsOn) badRequest('ends_before_start');
  const [dupe] = await db.select({ id: terms.id }).from(terms).where(eq(terms.id, body.id));
  if (dupe) conflict('term_exists');
  await db.insert(terms).values({ id: body.id, label: body.label ?? body.id, startsOn: body.startsOn, endsOn: body.endsOn });
  await audit(actor.person.id, 'term.create', 'term', body.id, body);
  return c.json({ id: body.id }, 201);
});
