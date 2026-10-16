import { defineHandler } from 'void';
import { audit } from '../../../src/server/audit';
import { bucket } from '../../../src/server/buckets';
import { CLUB_FILE_FIELDS, CLUB_FILE_TYPES, clubFileProblem, fileExtension, isSharedFileCategory } from '../../../src/server/club-files';
import { requirePermission } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';
import { rateLimit } from '../../../src/server/rate-limit';

/** Upload one file (multipart: file, category, optional event/project/meeting details). */
export const POST = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'files.manage');
  await rateLimit(c, 'club_files_upload', 20, 3600);
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) badRequest('file_required');
  const problem = clubFileProblem(file);
  if (problem) badRequest(problem);
  const category = String(form.get('category') || 'general');
  if (!isSharedFileCategory(category)) badRequest('invalid_category');
  const ext = fileExtension(file.name);
  const contentType = CLUB_FILE_TYPES[ext];
  const id = crypto.randomUUID().replace(/-/g, '');
  const key = `${category}/${id}.${ext}`;
  const metadata: Record<string, string> = {
    fileName: file.name.slice(0, 255),
    fileType: contentType,
    uploadedBy: actor.person.email,
    uploadedByName: actor.person.fullName,
    createdAt: new Date().toISOString(),
  };
  for (const [field, max] of Object.entries(CLUB_FILE_FIELDS)) {
    const value = form.get(field);
    if (typeof value === 'string' && value.trim()) metadata[field] = value.trim().slice(0, max);
  }
  await bucket(c, 'CLUB_FILES').put(key, await file.arrayBuffer(), { httpMetadata: { contentType }, customMetadata: metadata });
  await audit(actor.person.id, 'club_file.upload', 'club_file', id, { fileName: metadata.fileName, category });
  return c.json({ id, key }, 201);
});
