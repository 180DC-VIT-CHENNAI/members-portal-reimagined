import { defineHandler } from 'void';
import { bucket } from '../../../src/server/buckets';
import { requirePermission } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from '../../../src/server/document-import';
import { fileExtension } from '../../../src/server/club-files';
import { rateLimit } from '../../../src/server/rate-limit';

/** The original PDF or DOCX, linked from the case study for download (multipart field `file`). */
export const POST = defineHandler(async (c) => {
  await requirePermission(c, 'content.publish');
  await rateLimit(c, 'case_study_upload_source', 20, 3600);
  const file = (await c.req.formData()).get('file');
  if (!(file instanceof File)) badRequest('file_required');
  const ext = fileExtension(file.name);
  if (ext !== 'pdf' && ext !== 'docx') badRequest('unsupported_file_type');
  if (file.size > MAX_DOCUMENT_BYTES) badRequest('file_too_large');
  const key = `source/${crypto.randomUUID()}.${ext}`;
  await bucket(c, 'CASE_STUDIES').put(key, await file.arrayBuffer(), { httpMetadata: { contentType: DOCUMENT_TYPES[ext] } });
  return { url: `/api/case-studies/images/${key}`, key };
});
