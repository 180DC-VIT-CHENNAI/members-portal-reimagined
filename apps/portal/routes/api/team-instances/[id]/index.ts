import {
  instanceDepartments,
  instanceExternals,
  instanceGroups,
  instanceLevels,
  instanceTeamExternals,
  instanceTeamMembers,
  instanceTeams,
  teamInstances,
} from '@schema';
import type { BatchItem } from 'drizzle-orm/batch';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, eq, gt, inArray } from 'void/db';
import { requirePrincipal } from '../../../../src/server/guard';
import { badRequest, forbidden, idParam } from '../../../../src/server/http';
import { rateLimit } from '../../../../src/server/rate-limit';
import { instanceAccess, ladder } from '../../../../src/server/team-instance-rules';
import { instanceDetail } from '../../../../src/server/team-instance-views';
import { instanceAudit, instanceFields, instanceFor, requireDepartments, requireInstanceRight } from '../../../../src/server/team-instances';

/** One instance: departments, levels, groups and their teams with everyone on them, outside people, totals and the caller's rights. */
export const GET = defineHandler(async (c) => instanceDetail(await instanceFor(await requirePrincipal(c), idParam(c))));

/**
 * Change the settings, departments or levels. Needs team_instances.manage over
 * all its departments, and over any new ones. Shrinking the ladder moves teams
 * above it to the new top level.
 */
export const PATCH = defineHandler.withValidator({ body: v.partial(v.object(instanceFields)) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'configure');
  const departmentIds = body.departmentIds ? [...new Set(body.departmentIds)] : null;
  if (departmentIds && !instanceAccess(actor.permissions, departmentIds).configure) forbidden();
  await rateLimit(c, 'team_instances_write', 120, 3600);
  if (departmentIds) await requireDepartments(departmentIds);
  const id = loaded.instance.id;
  const changes: Partial<typeof teamInstances.$inferInsert> = {};
  if (body.name !== undefined) changes.name = body.name;
  if (body.description !== undefined) changes.description = body.description || null;
  if (body.groupLabel !== undefined) changes.groupLabel = body.groupLabel;
  const statements: BatchItem<'sqlite'>[] = [];
  if (Object.keys(changes).length) statements.push(db.update(teamInstances).set(changes).where(eq(teamInstances.id, id)));
  if (departmentIds) {
    statements.push(
      db.delete(instanceDepartments).where(eq(instanceDepartments.instanceId, id)),
      ...departmentIds.map((departmentId) => db.insert(instanceDepartments).values({ instanceId: id, departmentId })),
    );
  }
  if (body.levels) {
    const levels = ladder(body.levels);
    statements.push(
      db.delete(instanceLevels).where(eq(instanceLevels.instanceId, id)),
      db.insert(instanceLevels).values(levels.map((level) => ({ instanceId: id, ...level }))),
      db
        .update(instanceTeams)
        .set({ currentLevel: levels.length })
        .where(and(eq(instanceTeams.instanceId, id), gt(instanceTeams.currentLevel, levels.length))),
    );
  }
  const [first, ...rest] = statements;
  if (!first) badRequest('nothing_to_change');
  await db.batch([first, ...rest]);
  await instanceAudit(actor, 'update', id, { fields: Object.keys(body) });
  return { id };
});

/** Delete the instance with its teams, groups, outside people and placements. Its audit trail stays. */
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'configure');
  await rateLimit(c, 'team_instances_write', 120, 3600);
  const id = loaded.instance.id;
  const teamsOf = () => db.select({ id: instanceTeams.id }).from(instanceTeams).where(eq(instanceTeams.instanceId, id));
  await db.batch([
    db.delete(instanceTeamMembers).where(inArray(instanceTeamMembers.teamId, teamsOf())),
    db.delete(instanceTeamExternals).where(inArray(instanceTeamExternals.teamId, teamsOf())),
    db.delete(instanceTeams).where(eq(instanceTeams.instanceId, id)),
    db.delete(instanceGroups).where(eq(instanceGroups.instanceId, id)),
    db.delete(instanceExternals).where(eq(instanceExternals.instanceId, id)),
    db.delete(instanceLevels).where(eq(instanceLevels.instanceId, id)),
    db.delete(instanceDepartments).where(eq(instanceDepartments.instanceId, id)),
    db.delete(teamInstances).where(eq(teamInstances.id, id)),
  ]);
  await instanceAudit(actor, 'delete', id, { name: loaded.instance.name });
  return { id };
});
