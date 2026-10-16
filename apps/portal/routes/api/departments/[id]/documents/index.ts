import { departmentDocuments } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { departmentOr404 } from '../../../../../src/server/departments';
import { requirePermission } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { optionalText } from '../../../../../src/server/validation';

const httpUrl = v.pipe(v.string(), v.trim(), v.maxLength(2048), v.url(), v.regex(/^https?:\/\//i, 'invalid_url'));

/** Record a link to a department document (the file itself lives elsewhere). */
export const POST = defineHandler.withValidator({
  body: v.object({
    title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
    description: optionalText(2000),
    fileUrl: v.optional(v.nullable(v.union([v.literal(''), httpUrl]))),
  }),
})(async (c, { body }) => {
  const departmentId = idParam(c);
  const actor = await requirePermission(c, 'departments.documents.manage', departmentId);
  await departmentOr404(departmentId);
  await rateLimit(c, 'department_workspace_write', 60, 3600);
  const id = crypto.randomUUID();
  await db.insert(departmentDocuments).values({
    id,
    departmentId,
    title: body.title,
    description: body.description || null,
    fileUrl: body.fileUrl || null,
    createdBy: actor.person.id,
  });
  await audit(actor.person.id, 'department_document.create', 'department_document', id, { departmentId, title: body.title });
  return c.json({ id }, 201);
});
