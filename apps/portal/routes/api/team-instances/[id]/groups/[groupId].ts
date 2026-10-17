import { instanceGroups, instanceTeams } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { routeParam } from '../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../src/server/guard';
import { badRequest, idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { groupOr404, instanceAudit, instanceFor, requireInstanceRight, sortOrder } from '../../../../../src/server/team-instances';
import { optionalText, singleLine } from '../../../../../src/server/validation';

const groupPatch = v.object({
  name: v.optional(singleLine(255)),
  organization: optionalText(200),
  description: optionalText(5000),
  sortOrder: v.optional(sortOrder),
});

/** Rename, describe or reorder a group. */
export const PATCH = defineHandler.withValidator({ body: groupPatch })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  const group = await groupOr404(loaded.instance.id, routeParam(c, 'groupId'));
  await rateLimit(c, 'team_instances_write', 120, 3600);
  const changes: Partial<typeof instanceGroups.$inferInsert> = {};
  if (body.name !== undefined) changes.name = body.name;
  if (body.organization !== undefined) changes.organization = body.organization || null;
  if (body.description !== undefined) changes.description = body.description || null;
  if (body.sortOrder !== undefined) changes.sortOrder = body.sortOrder;
  if (!Object.keys(changes).length) badRequest('nothing_to_change');
  await db.update(instanceGroups).set(changes).where(eq(instanceGroups.id, group.id));
  await instanceAudit(actor, 'group.update', loaded.instance.id, { groupId: group.id, group: changes.name ?? group.name, fields: Object.keys(changes) });
  return { id: group.id };
});

/** Remove a group. Its teams, and everyone on them, stay as teams in no group. */
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  const group = await groupOr404(loaded.instance.id, routeParam(c, 'groupId'));
  await rateLimit(c, 'team_instances_write', 120, 3600);
  await db.batch([
    db.update(instanceTeams).set({ groupId: null }).where(eq(instanceTeams.groupId, group.id)),
    db.delete(instanceGroups).where(eq(instanceGroups.id, group.id)),
  ]);
  await instanceAudit(actor, 'group.delete', loaded.instance.id, { groupId: group.id, group: group.name });
  return { id: group.id };
});
