import { departmentProjects } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { departmentOr404 } from '../../../../../src/server/departments';
import { requirePermission } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { isoDate, optionalText } from '../../../../../src/server/validation';

/** Add a project to the department's own tracker (not the club-wide projects). */
export const POST = defineHandler.withValidator({
  body: v.object({
    name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
    description: optionalText(2000),
    deadline: v.optional(v.nullable(isoDate)),
  }),
})(async (c, { body }) => {
  const departmentId = idParam(c);
  const actor = await requirePermission(c, 'departments.projects.manage', departmentId);
  await departmentOr404(departmentId);
  await rateLimit(c, 'department_workspace_write', 60, 3600);
  const id = crypto.randomUUID();
  await db.insert(departmentProjects).values({
    id,
    departmentId,
    name: body.name,
    description: body.description || null,
    deadline: body.deadline ?? null,
    createdBy: actor.person.id,
  });
  await audit(actor.person.id, 'department_project.create', 'department_project', id, { departmentId, name: body.name });
  return c.json({ id }, 201);
});
