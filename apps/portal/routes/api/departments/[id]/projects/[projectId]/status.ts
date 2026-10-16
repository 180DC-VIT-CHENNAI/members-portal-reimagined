import { DEPARTMENT_PROJECT_STATUSES, departmentProjects } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { audit } from '../../../../../../src/server/audit';
import { routeParam } from '../../../../../../src/server/departments';
import { requirePermission } from '../../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../../src/server/http';

export const PUT = defineHandler.withValidator({
  body: v.object({ status: v.picklist(DEPARTMENT_PROJECT_STATUSES) }),
})(async (c, { body }) => {
  const departmentId = idParam(c);
  const actor = await requirePermission(c, 'departments.projects.manage', departmentId);
  const id = routeParam(c, 'projectId');
  const [updated] = await db
    .update(departmentProjects)
    .set({ status: body.status })
    .where(and(eq(departmentProjects.id, id), eq(departmentProjects.departmentId, departmentId)))
    .returning({ id: departmentProjects.id });
  if (!updated) notFound('project_not_found');
  await audit(actor.person.id, 'department_project.status', 'department_project', id, { departmentId, status: body.status });
  return { id, status: body.status };
});
