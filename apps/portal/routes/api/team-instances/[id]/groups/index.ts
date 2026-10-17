import { instanceGroups } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq, sql } from 'void/db';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { groupFields, instanceAudit, instanceFor, requireInstanceRight } from '../../../../../src/server/team-instances';

/** Add a group (named by the instance's group label) after the existing ones. */
export const POST = defineHandler.withValidator({ body: v.object(groupFields) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  await rateLimit(c, 'team_instances_write', 120, 3600);
  const instanceId = loaded.instance.id;
  const [last] = await db
    .select({ top: sql<number | null>`max(${instanceGroups.sortOrder})` })
    .from(instanceGroups)
    .where(eq(instanceGroups.instanceId, instanceId));
  const id = crypto.randomUUID();
  await db.insert(instanceGroups).values({
    id,
    instanceId,
    name: body.name,
    organization: body.organization || null,
    description: body.description || null,
    sortOrder: (last?.top ?? -1) + 1,
    createdBy: actor.person.id,
  });
  await instanceAudit(actor, 'group.create', instanceId, { groupId: id, group: body.name });
  return c.json({ id }, 201);
});
