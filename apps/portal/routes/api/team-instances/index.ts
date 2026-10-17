import { instanceDepartments, instanceLevels, teamInstances } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { requirePrincipal } from '../../../src/server/guard';
import { forbidden } from '../../../src/server/http';
import { can } from '../../../src/server/permissions';
import { rateLimit } from '../../../src/server/rate-limit';
import { instanceAccess, ladder } from '../../../src/server/team-instance-rules';
import { listInstances } from '../../../src/server/team-instance-views';
import { instanceAudit, instanceFields, requireDepartments } from '../../../src/server/team-instances';

/** Team instances the caller can see, newest first, with departments, totals and their rights. */
export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  if (!can(principal.permissions, 'team_instances.view') && !can(principal.permissions, 'team_instances.manage')) forbidden();
  return listInstances(principal);
});

/** Create an instance for departments the caller manages, with its level ladder (one level by default). */
export const POST = defineHandler.withValidator({ body: v.object(instanceFields) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const departmentIds = [...new Set(body.departmentIds)];
  if (!instanceAccess(actor.permissions, departmentIds).configure) forbidden();
  await rateLimit(c, 'team_instances_write', 120, 3600);
  await requireDepartments(departmentIds);
  const id = crypto.randomUUID();
  const levels = ladder(body.levels ?? []);
  await db.batch([
    db.insert(teamInstances).values({
      id,
      name: body.name,
      description: body.description || null,
      groupLabel: body.groupLabel ?? 'Company',
      createdBy: actor.person.id,
    }),
    db.insert(instanceLevels).values(levels.map((level) => ({ instanceId: id, ...level }))),
    ...departmentIds.map((departmentId) => db.insert(instanceDepartments).values({ instanceId: id, departmentId })),
  ]);
  await instanceAudit(actor, 'create', id, { name: body.name, departmentIds, levels: levels.length });
  return c.json({ id }, 201);
});
