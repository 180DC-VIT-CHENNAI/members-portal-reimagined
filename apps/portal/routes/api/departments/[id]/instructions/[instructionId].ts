import { departmentInstructions } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { routeParam } from '../../../../../src/server/departments';
import { requirePermission } from '../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../src/server/http';

export const DELETE = defineHandler(async (c) => {
  const departmentId = idParam(c);
  const actor = await requirePermission(c, 'departments.instructions.manage', departmentId);
  const id = routeParam(c, 'instructionId');
  const [removed] = await db
    .delete(departmentInstructions)
    .where(and(eq(departmentInstructions.id, id), eq(departmentInstructions.departmentId, departmentId)))
    .returning({ title: departmentInstructions.title });
  if (!removed) notFound('instruction_not_found');
  await audit(actor.person.id, 'department_instruction.delete', 'department_instruction', id, { departmentId, title: removed.title });
  return null;
});
