import * as v from 'valibot';
import { defineHandler } from 'void';
import { routeParam } from '../../../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../../../src/server/guard';
import { idParam } from '../../../../../../../src/server/http';
import { rateLimit } from '../../../../../../../src/server/rate-limit';
import { externalOr404, instanceAudit, instanceFor, placeExternal, refusePlacement, requireInstanceRight, teamOr404 } from '../../../../../../../src/server/team-instances';
import { id } from '../../../../../../../src/server/validation';

/** Place an outside person from this instance's register on a team; the cap is checked atomically. */
export const POST = defineHandler.withValidator({ body: v.object({ externalId: id }) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  const team = await teamOr404(loaded.instance.id, routeParam(c, 'teamId'));
  await rateLimit(c, 'team_staffing', 600, 3600);
  const external = await externalOr404(loaded.instance.id, body.externalId);
  const [added] = await placeExternal(team.id, external.id, actor.person.id);
  if (!added) await refusePlacement('external', loaded.instance.id, team.id, external.id);
  await instanceAudit(actor, 'member.add', loaded.instance.id, { kind: 'external', teamId: team.id, team: team.name, memberId: external.id, member: external.name });
  return c.json({ teamId: team.id, externalId: external.id }, 201);
});
