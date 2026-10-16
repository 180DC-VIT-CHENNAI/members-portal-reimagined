import { departmentInstructions, INSTRUCTION_PRIORITIES, people } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, desc, eq } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { departmentOr404 } from '../../../../../src/server/departments';
import { requirePermission } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** Instructions for a department's members, newest first. */
export const GET = defineHandler(async (c) => {
  const departmentId = idParam(c);
  await requirePermission(c, 'departments.instructions.view', departmentId);
  await departmentOr404(departmentId);
  return db
    .select({
      id: departmentInstructions.id,
      title: departmentInstructions.title,
      content: departmentInstructions.content,
      priority: departmentInstructions.priority,
      createdAt: departmentInstructions.createdAt,
      authorName: people.fullName,
    })
    .from(departmentInstructions)
    .leftJoin(people, eq(people.id, departmentInstructions.createdBy))
    .where(eq(departmentInstructions.departmentId, departmentId))
    .orderBy(desc(departmentInstructions.createdAt), desc(departmentInstructions.id));
});

export const POST = defineHandler.withValidator({
  body: v.object({
    title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
    content: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(5000)),
    priority: v.optional(v.picklist(INSTRUCTION_PRIORITIES), 'medium'),
  }),
})(async (c, { body }) => {
  const departmentId = idParam(c);
  const actor = await requirePermission(c, 'departments.instructions.manage', departmentId);
  await departmentOr404(departmentId);
  await rateLimit(c, 'department_workspace_write', 60, 3600);
  const id = crypto.randomUUID();
  await db.insert(departmentInstructions).values({ id, departmentId, ...body, createdBy: actor.person.id });
  await audit(actor.person.id, 'department_instruction.create', 'department_instruction', id, { departmentId, title: body.title });
  return c.json({ id }, 201);
});
