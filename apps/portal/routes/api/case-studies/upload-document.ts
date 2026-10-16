import { defineHandler } from 'void';
import { requirePermission } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';
import { DOCUMENT_TYPES, importDocument, MAX_DOCUMENT_BYTES } from '../../../src/server/document-import';
import { fileExtension } from '../../../src/server/club-files';
import { rateLimit } from '../../../src/server/rate-limit';

/** Turn a PDF or DOCX into case-study HTML plus a suggested title and summary. Nothing is stored. */
export const POST = defineHandler(async (c) => {
  await requirePermission(c, 'content.publish');
  await rateLimit(c, 'case_study_upload_doc', 20, 3600);
  const file = (await c.req.formData()).get('document');
  if (!(file instanceof File)) badRequest('document_required');
  const ext = fileExtension(file.name);
  if ((ext !== 'pdf' && ext !== 'docx') || (file.type && file.type !== DOCUMENT_TYPES[ext])) badRequest('unsupported_file_type');
  if (file.size > MAX_DOCUMENT_BYTES) badRequest('file_too_large');
  const imported = await importDocument(ext, await file.arrayBuffer());
  if (!imported) badRequest('document_empty');
  return imported;
});
