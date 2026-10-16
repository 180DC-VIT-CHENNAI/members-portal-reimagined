import { defineHandler } from 'void';
import { bucket } from '../../../src/server/buckets';
import { badRequest, notFound } from '../../../src/server/http';

/** Public gallery photos from the `cdn` bucket, cached for a year. */
export const GET = defineHandler(async (c) => {
  const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/api\/gallery-cdn\//, ''));
  if (!key || key.includes('..')) badRequest('invalid_key');
  const object = await bucket(c, 'GALLERY_CDN').get(key);
  if (!object) notFound('image_not_found');
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
