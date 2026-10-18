import { DEPARTMENT_PROJECT_STATUSES, projects } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../../../../src/server/audit';
import { routeParam } from '../../../../../../src/server/departments';
import { requirePermission } from '../../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../../src/server/http';
import { projectFor, requireRight } from '../../../../../../src/server/projects';

export const PUT = defineHandler.withValidator({
  body: v.object({ status: v.picklist(DEPARTMENT_PROJECT_STATUSES) }),
})(async (c, { body }) => {
  const departmentId = idParam(c);
  const actor = await requirePermission(c, 'departments.projects.manage', departmentId);
  const id = routeParam(c, 'projectId');
  const [legacy] = await db.select({ id: projects.id }).from(projects).where(eq(projects.legacyDepartmentProjectId, id));
  const loaded = await projectFor(actor, legacy?.id ?? id);
  if (!loaded.project.internal || !loaded.departmentIds.includes(departmentId)) notFound('project_not_found');
  requireRight(loaded, 'manage');
  const [updated] = await db
    .update(projects)
    .set({ status: body.status, completedAt: body.status === 'completed' ? new Date().toISOString() : null })
    .where(eq(projects.id, loaded.project.id))
    .returning({ id: projects.id });
  if (!updated) notFound('project_not_found');
  await audit(actor.person.id, 'department_project.status', 'department_project', id, { departmentId, status: body.status });
  return { id, status: body.status };
});
