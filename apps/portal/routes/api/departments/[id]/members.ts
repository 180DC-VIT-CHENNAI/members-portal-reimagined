import { defineHandler } from 'void';
import { departmentMembers, departmentOr404 } from '../../../../src/server/departments';
import { requirePermission } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';

/** Current members of a department (home department, active or on leave). */
export const GET = defineHandler(async (c) => {
  const departmentId = idParam(c);
  await requirePermission(c, 'departments.members.view', departmentId);
  await departmentOr404(departmentId);
  return departmentMembers(departmentId);
});
