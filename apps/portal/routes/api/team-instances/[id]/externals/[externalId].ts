import { instanceExternals, instanceTeamExternals } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, eq, ne } from 'void/db';
import { routeParam } from '../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../src/server/guard';
import { badRequest, conflict, idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { externalOr404, instanceAudit, instanceFor, requireInstanceRight } from '../../../../../src/server/team-instances';
import { emailAddress, optionalText, singleLine } from '../../../../../src/server/validation';

const externalPatch = v.object({
  name: v.optional(singleLine(255)),
  email: v.optional(v.nullable(emailAddress)),
  organization: optionalText(200),
});

/** Change an outside person's name, email (null clears it) or organisation. */
export const PATCH = defineHandler.withValidator({ body: externalPatch })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  const external = await externalOr404(loaded.instance.id, routeParam(c, 'externalId'));
  await rateLimit(c, 'team_instances_write', 120, 3600);
  if (body.email) {
    const [taken] = await db
      .select({ id: instanceExternals.id })
      .from(instanceExternals)
      .where(and(eq(instanceExternals.instanceId, loaded.instance.id), eq(instanceExternals.email, body.email), ne(instanceExternals.id, external.id)))
      .limit(1);
    if (taken) conflict('external_email_taken');
  }
  const changes: Partial<typeof instanceExternals.$inferInsert> = {};
  if (body.name !== undefined) changes.name = body.name;
  if (body.email !== undefined) changes.email = body.email;
  if (body.organization !== undefined) changes.organization = body.organization || null;
  if (!Object.keys(changes).length) badRequest('nothing_to_change');
  await db.update(instanceExternals).set(changes).where(eq(instanceExternals.id, external.id));
  await instanceAudit(actor, 'external.update', loaded.instance.id, { externalId: external.id, name: changes.name ?? external.name, fields: Object.keys(changes) });
  return { id: external.id };
});

/** Remove an outside person from the register and from every team they are on. */
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  const external = await externalOr404(loaded.instance.id, routeParam(c, 'externalId'));
  await rateLimit(c, 'team_instances_write', 120, 3600);
  await db.batch([
    db.delete(instanceTeamExternals).where(eq(instanceTeamExternals.externalId, external.id)),
    db.delete(instanceExternals).where(eq(instanceExternals.id, external.id)),
  ]);
  await instanceAudit(actor, 'external.delete', loaded.instance.id, { externalId: external.id, name: external.name });
  return { id: external.id };
});
