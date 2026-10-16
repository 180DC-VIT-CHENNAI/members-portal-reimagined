import { defineHandler } from 'void';
import { bucket } from '../../../src/server/buckets';
import { CASE_STUDY_IMAGE_TYPES, MAX_CASE_STUDY_IMAGE_BYTES } from '../../../src/server/case-study-files';
import { requirePermission } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';
import { rateLimit } from '../../../src/server/rate-limit';

/** Cover or inline image for a case study (multipart field `image`). */
export const POST = defineHandler(async (c) => {
  await requirePermission(c, 'content.publish');
  await rateLimit(c, 'case_study_upload_image', 20, 3600);
  const file = (await c.req.formData()).get('image');
  if (!(file instanceof File)) badRequest('image_required');
  const ext = CASE_STUDY_IMAGE_TYPES[file.type];
  if (!ext) badRequest('unsupported_image_type');
  if (file.size > MAX_CASE_STUDY_IMAGE_BYTES) badRequest('file_too_large');
  const key = `images/${crypto.randomUUID()}.${ext}`;
  await bucket(c, 'CASE_STUDIES').put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return { url: `/api/case-studies/images/${key}`, key };
});
