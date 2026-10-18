import { projectDepartments, projectMembers, projects, projectTasks, taskComments } from '@schema';
import type { BatchItem } from 'drizzle-orm/batch';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq, inArray } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePrincipal } from '../../../../src/server/guard';
import { badRequest, forbidden, idParam } from '../../../../src/server/http';
import { projectAccess } from '../../../../src/server/project-rules';
import { projectDetail, projectFields, projectFor, requireKnown, requireRight } from '../../../../src/server/projects';
import { rateLimit } from '../../../../src/server/rate-limit';

/** A project with its departments, people and tasks. */
export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  return projectDetail(principal, await projectFor(principal, idParam(c)));
});

/** Edit a project. Changing departments needs projects.manage over the new ones too. */
export const PATCH = defineHandler.withValidator({ body: v.partial(v.object(projectFields)) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await projectFor(actor, idParam(c));
  requireRight(loaded, 'manage');
  const departmentIds = body.departmentIds ? [...new Set(body.departmentIds)] : null;
  const internal = body.internal ?? loaded.project.internal;
  if (departmentIds && !projectAccess(actor.permissions, departmentIds, loaded.member, internal).manage) forbidden();
  if (body.internal === false && loaded.project.internal && !projectAccess(actor.permissions, departmentIds ?? loaded.departmentIds, false).manage) forbidden();
  await rateLimit(c, 'projects_write', 60, 3600);
  await requireKnown(departmentIds ?? [], body.termId);
  const changes: Partial<typeof projects.$inferInsert> = {};
  if (body.name !== undefined) changes.name = body.name;
  if (body.client !== undefined) changes.client = body.client || null;
  if (body.description !== undefined) changes.description = body.description || null;
  if (body.termId !== undefined) changes.termId = body.termId;
  if (body.deadline !== undefined) changes.deadline = body.deadline;
  if (body.internal !== undefined) changes.internal = body.internal;
  const projectId = loaded.project.id;
  const statements: BatchItem<'sqlite'>[] = [];
  if (Object.keys(changes).length) statements.push(db.update(projects).set(changes).where(eq(projects.id, projectId)));
  if (departmentIds) {
    statements.push(
      db.delete(projectDepartments).where(eq(projectDepartments.projectId, projectId)),
      ...departmentIds.map((departmentId) => db.insert(projectDepartments).values({ projectId, departmentId })),
    );
  }
  const [first, ...rest] = statements;
  if (!first) badRequest('nothing_to_change');
  await db.batch([first, ...rest]);
  await audit(actor.person.id, 'project.update', 'project', projectId, { fields: Object.keys(body) });
  return { id: projectId };
});

/** Remove a project with its tasks, their comments and its people. Needs projects.manage over all its departments. */
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const loaded = await projectFor(actor, idParam(c));
  requireRight(loaded, 'manage');
  await rateLimit(c, 'projects_write', 60, 3600);
  const { project } = loaded;
  await db.batch([
    db.delete(taskComments).where(inArray(taskComments.taskId, db.select({ id: projectTasks.id }).from(projectTasks).where(eq(projectTasks.projectId, project.id)))),
    db.delete(projectTasks).where(eq(projectTasks.projectId, project.id)),
    db.delete(projectMembers).where(eq(projectMembers.projectId, project.id)),
    db.delete(projectDepartments).where(eq(projectDepartments.projectId, project.id)),
    db.delete(projects).where(eq(projects.id, project.id)),
  ]);
  await audit(actor.person.id, 'project.delete', 'project', project.id, { name: project.name });
  return { id: project.id };
});
