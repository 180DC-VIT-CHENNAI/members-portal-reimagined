import { instanceExternals } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { requirePrincipal } from '../../../../../src/server/guard';
import { conflict, idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { externalFields, instanceAudit, instanceFor, requireInstanceRight } from '../../../../../src/server/team-instances';

/** Add an outside person to the instance's register. Emails are unique within an instance, ignoring case. */
export const POST = defineHandler.withValidator({ body: v.object(externalFields) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  await rateLimit(c, 'team_instances_write', 120, 3600);
  const id = crypto.randomUUID();
  const [added] = await db
    .insert(instanceExternals)
    .values({
      id,
      instanceId: loaded.instance.id,
      name: body.name,
      email: body.email ?? null,
      organization: body.organization || null,
      createdBy: actor.person.id,
    })
    .onConflictDoNothing()
    .returning({ id: instanceExternals.id });
  if (!added) conflict('external_email_taken');
  await instanceAudit(actor, 'external.create', loaded.instance.id, { externalId: id, name: body.name });
  return c.json({ id }, 201);
});
