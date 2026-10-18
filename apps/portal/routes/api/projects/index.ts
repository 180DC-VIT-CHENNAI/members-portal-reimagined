import { projectDepartments, projects } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../src/server/audit';
import { requirePrincipal } from '../../../src/server/guard';
import { forbidden } from '../../../src/server/http';
import { projectAccess } from '../../../src/server/project-rules';
import { listProjects, notifyProjectLeads, projectFields, requireKnown } from '../../../src/server/projects';
import { rateLimit } from '../../../src/server/rate-limit';

/** Every project the caller can see, newest first. */
export const GET = defineHandler(async (c) => listProjects(await requirePrincipal(c)));

/** Create a project for one or more departments and email their leads. */
export const POST = defineHandler.withValidator({ body: v.object(projectFields) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const departmentIds = [...new Set(body.departmentIds)];
  const internal = body.internal ?? false;
  if (!projectAccess(actor.permissions, departmentIds, false, internal).manage) forbidden();
  await rateLimit(c, 'projects_write', 60, 3600);
  await requireKnown(departmentIds, body.termId);
  const project = {
    id: crypto.randomUUID(),
    name: body.name,
    client: body.client || null,
    description: body.description || null,
    termId: body.termId ?? null,
    deadline: body.deadline ?? null,
    internal,
  };
  await db.batch([
    db.insert(projects).values({ ...project, createdBy: actor.person.id }),
    ...departmentIds.map((departmentId) => db.insert(projectDepartments).values({ projectId: project.id, departmentId })),
  ]);
  const notified = await notifyProjectLeads(project, departmentIds, actor.person);
  await audit(actor.person.id, 'project.create', 'project', project.id, { name: project.name, departmentIds, notified });
  return c.json({ id: project.id, notified }, 201);
});
