import { instanceTeamMembers, people } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { routeParam } from '../../../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../../../src/server/guard';
import { idParam } from '../../../../../../../src/server/http';
import { rateLimit } from '../../../../../../../src/server/rate-limit';
import { instanceAudit, instanceFor, requireInstanceRight, teamOr404 } from '../../../../../../../src/server/team-instances';

/** Take a member off a team. Removing someone who is not on it changes nothing. */
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  const team = await teamOr404(loaded.instance.id, routeParam(c, 'teamId'));
  await rateLimit(c, 'team_staffing', 600, 3600);
  const personId = routeParam(c, 'personId');
  const [removed] = await db
    .delete(instanceTeamMembers)
    .where(and(eq(instanceTeamMembers.teamId, team.id), eq(instanceTeamMembers.personId, personId)))
    .returning({ personId: instanceTeamMembers.personId });
  if (removed) {
    const [person] = await db.select({ name: people.fullName }).from(people).where(eq(people.id, personId));
    await instanceAudit(actor, 'member.remove', loaded.instance.id, { kind: 'person', teamId: team.id, team: team.name, memberId: personId, member: person?.name ?? null });
  }
  return { removed: removed !== undefined };
});
