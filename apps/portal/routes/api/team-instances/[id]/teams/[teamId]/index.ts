import { instanceTeamExternals, instanceTeamMembers, instanceTeams } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq, sql } from 'void/db';
import { routeParam } from '../../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { badRequest, conflict, idParam } from '../../../../../../src/server/http';
import { rateLimit } from '../../../../../../src/server/rate-limit';
import {
  instanceAudit,
  instanceFor,
  placedOnTeam,
  requireGroup,
  requireInstanceRight,
  requireSizes,
  teamOr404,
  teamPatch,
} from '../../../../../../src/server/team-instances';

/**
 * Edit a team: name, description, group (null for none), sizes (null removes a
 * limit), order, level and status. The cap cannot drop below who is on it.
 */
export const PATCH = defineHandler.withValidator({ body: teamPatch })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  const team = await teamOr404(loaded.instance.id, routeParam(c, 'teamId'));
  await rateLimit(c, 'team_instances_write', 120, 3600);
  if (body.groupId) await requireGroup(loaded.instance.id, body.groupId);
  const next = {
    name: body.name ?? team.name,
    description: body.description === undefined ? team.description : body.description || null,
    groupId: body.groupId === undefined ? team.groupId : body.groupId || null,
    minMembers: body.minMembers === undefined ? team.minMembers : body.minMembers,
    maxMembers: body.maxMembers === undefined ? team.maxMembers : body.maxMembers,
    sortOrder: body.sortOrder ?? team.sortOrder,
    currentLevel: body.currentLevel ?? team.currentLevel,
    status: body.status ?? team.status,
  };
  requireSizes(next.minMembers, next.maxMembers);
  if (next.currentLevel > loaded.levels.length) badRequest('level_out_of_range');
  const fields = (Object.keys(next) as (keyof typeof next)[]).filter((key) => next[key] !== team[key]);
  if (!fields.length) return { id: team.id, changed: false };
  // A new cap applies only while it still fits who is on the team, checked in the update itself.
  const cap = fields.includes('maxMembers') ? next.maxMembers : null;
  const [updated] = await db
    .update(instanceTeams)
    .set(next)
    .where(and(eq(instanceTeams.id, team.id), cap === null ? undefined : sql`${placedOnTeam()} <= ${cap}`))
    .returning({ id: instanceTeams.id });
  if (!updated) {
    await teamOr404(loaded.instance.id, team.id);
    conflict('cap_below_members');
  }
  const levelName = (position: number) => loaded.levels.find((level) => level.position === position)?.name ?? `Level ${position}`;
  await instanceAudit(actor, 'team.update', loaded.instance.id, {
    teamId: team.id,
    team: next.name,
    fields,
    ...(fields.includes('status') ? { status: { from: team.status, to: next.status } } : {}),
    ...(fields.includes('currentLevel') ? { level: { from: levelName(team.currentLevel), to: levelName(next.currentLevel) } } : {}),
  });
  return { id: team.id, changed: true };
});

/** Delete a team and its placements. Outside people stay in the register. */
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  const team = await teamOr404(loaded.instance.id, routeParam(c, 'teamId'));
  await rateLimit(c, 'team_instances_write', 120, 3600);
  await db.batch([
    db.delete(instanceTeamMembers).where(eq(instanceTeamMembers.teamId, team.id)),
    db.delete(instanceTeamExternals).where(eq(instanceTeamExternals.teamId, team.id)),
    db.delete(instanceTeams).where(eq(instanceTeams.id, team.id)),
  ]);
  await instanceAudit(actor, 'team.delete', loaded.instance.id, { teamId: team.id, team: team.name });
  return { id: team.id };
});
