import { departmentDocuments } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { routeParam } from '../../../../../src/server/departments';
import { requirePermission } from '../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../src/server/http';

/** Remove a document link (no stored file is touched). */
export const DELETE = defineHandler(async (c) => {
  const departmentId = idParam(c);
  const actor = await requirePermission(c, 'departments.documents.manage', departmentId);
  const id = routeParam(c, 'documentId');
  const [removed] = await db
    .delete(departmentDocuments)
    .where(and(eq(departmentDocuments.id, id), eq(departmentDocuments.departmentId, departmentId)))
    .returning({ title: departmentDocuments.title });
  if (!removed) notFound('document_not_found');
  await audit(actor.person.id, 'department_document.delete', 'department_document', id, { departmentId, title: removed.title });
  return null;
});
