import { instanceExternals, instanceTeamExternals } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { routeParam } from '../../../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../../../src/server/guard';
import { idParam } from '../../../../../../../src/server/http';
import { rateLimit } from '../../../../../../../src/server/rate-limit';
import { instanceAudit, instanceFor, requireInstanceRight, teamOr404 } from '../../../../../../../src/server/team-instances';

/** Take an outside person off a team; they stay in the register. Removing someone not on it changes nothing. */
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  const team = await teamOr404(loaded.instance.id, routeParam(c, 'teamId'));
  await rateLimit(c, 'team_staffing', 600, 3600);
  const externalId = routeParam(c, 'externalId');
  const [removed] = await db
    .delete(instanceTeamExternals)
    .where(and(eq(instanceTeamExternals.teamId, team.id), eq(instanceTeamExternals.externalId, externalId)))
    .returning({ externalId: instanceTeamExternals.externalId });
  if (removed) {
    const [external] = await db.select({ name: instanceExternals.name }).from(instanceExternals).where(eq(instanceExternals.id, externalId));
    await instanceAudit(actor, 'member.remove', loaded.instance.id, { kind: 'external', teamId: team.id, team: team.name, memberId: externalId, member: external?.name ?? null });
  }
  return { removed: removed !== undefined };
});
