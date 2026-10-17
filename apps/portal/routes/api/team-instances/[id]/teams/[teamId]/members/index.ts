import * as v from 'valibot';
import { defineHandler } from 'void';
import { routeParam } from '../../../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../../../src/server/guard';
import { idParam } from '../../../../../../../src/server/http';
import { rateLimit } from '../../../../../../../src/server/rate-limit';
import { instanceAudit, instanceFor, placeablePerson, placeMember, refusePlacement, requireInstanceRight, teamOr404 } from '../../../../../../../src/server/team-instances';
import { id } from '../../../../../../../src/server/validation';

/** Place a member on a team. They must be able to see the instance and be in the caller's departments; the cap is checked atomically. */
export const POST = defineHandler.withValidator({ body: v.object({ personId: id }) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  const team = await teamOr404(loaded.instance.id, routeParam(c, 'teamId'));
  await rateLimit(c, 'team_staffing', 600, 3600);
  const person = await placeablePerson(actor, loaded, body.personId);
  const [added] = await placeMember(team.id, person.id, actor.person.id);
  if (!added) await refusePlacement('person', loaded.instance.id, team.id, person.id);
  await instanceAudit(actor, 'member.add', loaded.instance.id, { kind: 'person', teamId: team.id, team: team.name, memberId: person.id, member: person.fullName });
  return c.json({ teamId: team.id, personId: person.id }, 201);
});
