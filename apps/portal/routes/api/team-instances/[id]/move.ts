import { instanceTeamExternals, instanceTeamMembers } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, eq, sql } from 'void/db';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam, notFound } from '../../../../src/server/http';
import { rateLimit } from '../../../../src/server/rate-limit';
import {
  instanceAudit,
  instanceFor,
  isPlaced,
  PLACEMENT_KINDS,
  placeableName,
  placeExternal,
  placeMember,
  refusePlacement,
  requireInstanceRight,
  teamOr404,
} from '../../../../src/server/team-instances';
import { id } from '../../../../src/server/validation';

const moveBody = v.object({ kind: v.picklist(PLACEMENT_KINDS), memberId: id, fromTeamId: id, toTeamId: id });

/**
 * Move a person or outside person between two teams of the instance. The add
 * (capped atomically) and the removal commit together, so a refused or failed
 * move leaves them where they were.
 */
export const POST = defineHandler.withValidator({ body: moveBody })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  await rateLimit(c, 'team_staffing', 600, 3600);
  if (body.fromTeamId === body.toTeamId) return { moved: false };
  const instanceId = loaded.instance.id;
  const [from, to] = await Promise.all([teamOr404(instanceId, body.fromTeamId), teamOr404(instanceId, body.toTeamId)]);
  if (!(await isPlaced(body.kind, from.id, body.memberId))) notFound('not_on_team');
  const member = await placeableName(actor, loaded, body.kind, body.memberId);
  // One batch: the capped insert, then the removal only if the insert changed a row.
  const added = await (async () => {
    switch (body.kind) {
      case 'person': {
        const [rows] = await db.batch([
          placeMember(to.id, body.memberId, actor.person.id),
          db
            .delete(instanceTeamMembers)
            .where(and(eq(instanceTeamMembers.teamId, from.id), eq(instanceTeamMembers.personId, body.memberId), sql`changes() = 1`)),
        ]);
        return rows.length > 0;
      }
      case 'external': {
        const [rows] = await db.batch([
          placeExternal(to.id, body.memberId, actor.person.id),
          db
            .delete(instanceTeamExternals)
            .where(and(eq(instanceTeamExternals.teamId, from.id), eq(instanceTeamExternals.externalId, body.memberId), sql`changes() = 1`)),
        ]);
        return rows.length > 0;
      }
      default: {
        const unhandled: never = body.kind;
        throw new Error(`Unhandled placement kind: ${String(unhandled)}`);
      }
    }
  })();
  if (!added) await refusePlacement(body.kind, instanceId, to.id, body.memberId);
  await instanceAudit(actor, 'member.move', instanceId, {
    kind: body.kind,
    memberId: body.memberId,
    member,
    fromTeamId: from.id,
    fromTeam: from.name,
    toTeamId: to.id,
    toTeam: to.name,
  });
  return { moved: true };
});
