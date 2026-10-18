import { departmentDocuments, departmentInstructions, people } from '@schema';
import { defineHandler } from 'void';
import { db, desc, eq } from 'void/db';
import { departmentOr404 } from '../../../../src/server/departments';
import { requirePermission } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { listProjects } from '../../../../src/server/projects';

/** A department's workspace: documents, instructions and its own projects, newest first. */
export const GET = defineHandler(async (c) => {
  const departmentId = idParam(c);
  const principal = await requirePermission(c, 'departments.workspace.view', departmentId);
  const department = await departmentOr404(departmentId);
  const [documents, instructions, work] = await Promise.all([
    db
      .select({
        id: departmentDocuments.id,
        title: departmentDocuments.title,
        description: departmentDocuments.description,
        fileUrl: departmentDocuments.fileUrl,
        status: departmentDocuments.status,
        createdAt: departmentDocuments.createdAt,
        authorName: people.fullName,
      })
      .from(departmentDocuments)
      .leftJoin(people, eq(people.id, departmentDocuments.createdBy))
      .where(eq(departmentDocuments.departmentId, departmentId))
      .orderBy(desc(departmentDocuments.createdAt), desc(departmentDocuments.id)),
    db
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
      .orderBy(desc(departmentInstructions.createdAt), desc(departmentInstructions.id)),
    listProjects(principal).then((rows) => rows.filter((project) => project.departments.some((department) => department.id === departmentId))),
  ]);
  return { department, documents, instructions, projects: work };
});
