import { departmentDocuments, departmentInstructions, departmentProjects, people } from '@schema';
import { defineHandler } from 'void';
import { db, desc, eq } from 'void/db';
import { departmentOr404 } from '../../../../src/server/departments';
import { requirePermission } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';

/** A department's workspace: documents, instructions and its own projects, newest first. */
export const GET = defineHandler(async (c) => {
  const departmentId = idParam(c);
  await requirePermission(c, 'departments.workspace.view', departmentId);
  const department = await departmentOr404(departmentId);
  const [documents, instructions, projects] = await Promise.all([
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
    db
      .select({
        id: departmentProjects.id,
        name: departmentProjects.name,
        description: departmentProjects.description,
        status: departmentProjects.status,
        deadline: departmentProjects.deadline,
        createdAt: departmentProjects.createdAt,
        authorName: people.fullName,
      })
      .from(departmentProjects)
      .leftJoin(people, eq(people.id, departmentProjects.createdBy))
      .where(eq(departmentProjects.departmentId, departmentId))
      .orderBy(desc(departmentProjects.createdAt), desc(departmentProjects.id)),
  ]);
  return { department, documents, instructions, projects };
});
