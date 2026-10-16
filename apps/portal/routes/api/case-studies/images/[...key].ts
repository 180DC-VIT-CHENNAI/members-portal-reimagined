import { defineHandler } from 'void';
import { bucket } from '../../../../src/server/buckets';
import { isCaseStudyFileKey } from '../../../../src/server/case-study-files';
import { badRequest, notFound } from '../../../../src/server/http';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Public case-study images (inline) and source documents (PDF inline, DOCX as a download). */
export const GET = defineHandler(async (c) => {
  await rateLimit(c, 'case_study_image_serve', 200, 60);
  const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/api\/case-studies\/images\//, ''));
  if (!isCaseStudyFileKey(key)) badRequest('invalid_key');
  const object = await bucket(c, 'CASE_STUDIES').get(key);
  if (!object) notFound('image_not_found');
  const type = object.httpMetadata?.contentType || 'application/octet-stream';
  const inline = type.startsWith('image/') || type === 'application/pdf';
  return new Response(object.body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      ...(inline ? {} : { 'Content-Disposition': 'attachment' }),
    },
  });
});
