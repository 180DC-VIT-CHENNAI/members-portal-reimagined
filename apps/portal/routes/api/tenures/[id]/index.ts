import { people, positions, tenures } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePermission } from '../../../../src/server/guard';
import { badRequest, idParam, notFound } from '../../../../src/server/http';
import { createsCycle } from '../../../../src/server/org-chart';
import { id } from '../../../../src/server/validation';

/** Set or clear who the holder of this tenure reports to (people.edit for the position). */
export const PATCH = defineHandler.withValidator({ body: v.object({ reportsToPersonId: v.nullable(id) }) })(async (c, { body }) => {
  const [row] = await db
    .select({ tenure: tenures, positionDept: positions.departmentId, personDept: people.departmentId })
    .from(tenures)
    .innerJoin(positions, eq(positions.id, tenures.positionId))
    .innerJoin(people, eq(people.id, tenures.personId))
    .where(eq(tenures.id, idParam(c)));
  if (!row) notFound('tenure_not_found');
  const actor = await requirePermission(c, 'people.edit', row.positionDept ?? row.personDept);
  const managerId = body.reportsToPersonId;
  if (managerId) {
    const [manager] = await db.select({ id: people.id }).from(people).where(eq(people.id, managerId));
    if (!manager) badRequest('unknown_person');
    const termTenures = await db
      .select({ personId: tenures.personId, reportsTo: tenures.reportsToPersonId })
      .from(tenures)
      .where(eq(tenures.termId, row.tenure.termId));
    if (createsCycle(termTenures, row.tenure.personId, managerId)) badRequest('reports_to_cycle');
  }
  await db.update(tenures).set({ reportsToPersonId: managerId }).where(eq(tenures.id, row.tenure.id));
  await audit(actor.person.id, 'tenure.reports_to', 'person', row.tenure.personId, { tenureId: row.tenure.id, reportsToPersonId: managerId });
  return { id: row.tenure.id, reportsToPersonId: managerId };
});
