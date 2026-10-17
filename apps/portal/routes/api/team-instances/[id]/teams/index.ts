import { instanceTeams } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq, sql } from 'void/db';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { instanceAudit, instanceFor, requireGroup, requireInstanceRight, requireSizes, teamFields } from '../../../../../src/server/team-instances';

/** Add a team, optionally in a group, with optional minimum and maximum sizes. It starts active on level 1. */
export const POST = defineHandler.withValidator({ body: v.object(teamFields) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  await rateLimit(c, 'team_instances_write', 120, 3600);
  const instanceId = loaded.instance.id;
  const groupId = body.groupId || null;
  await requireGroup(instanceId, groupId);
  const minMembers = body.minMembers ?? null;
  const maxMembers = body.maxMembers ?? null;
  requireSizes(minMembers, maxMembers);
  const [last] = await db
    .select({ top: sql<number | null>`max(${instanceTeams.sortOrder})` })
    .from(instanceTeams)
    .where(eq(instanceTeams.instanceId, instanceId));
  const id = crypto.randomUUID();
  await db.insert(instanceTeams).values({
    id,
    instanceId,
    groupId,
    name: body.name,
    description: body.description || null,
    minMembers,
    maxMembers,
    sortOrder: (last?.top ?? -1) + 1,
    createdBy: actor.person.id,
  });
  await instanceAudit(actor, 'team.create', instanceId, { teamId: id, team: body.name });
  return c.json({ id }, 201);
});
