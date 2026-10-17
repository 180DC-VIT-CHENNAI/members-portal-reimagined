import { newsletterAssets } from '@schema';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { bucket } from '../../../src/server/buckets';
import { fileExtension } from '../../../src/server/club-files';
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from '../../../src/server/document-import';
import { requirePermission } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';
import { assetUrl } from '../../../src/server/newsletter/issues';
import { rateLimit } from '../../../src/server/rate-limit';

const TYPES: Record<string, string | undefined> = { ...DOCUMENT_TYPES, jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
export const POST = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'newsletter.edit', null);
  await rateLimit(c, 'newsletter_upload', 20, 3600);
  const file = (await c.req.formData()).get('file');
  if (!(file instanceof File)) badRequest('file_required');
  const ext = fileExtension(file.name);
  const type = TYPES[ext];
  if (!type) badRequest('unsupported_file_type');
  if (!file.size || file.size > MAX_DOCUMENT_BYTES) badRequest('file_too_large');
  const data = await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  const header = new TextDecoder('latin1').decode(bytes.slice(0, 12));
  const valid = ext === 'pdf' ? header.startsWith('%PDF-') : ext === 'docx' ? header.startsWith('PK') : ext === 'png' ? bytes[0] === 137 && header.slice(1,4) === 'PNG' : ext === 'gif' ? header.startsWith('GIF8') : ext === 'webp' ? header.startsWith('RIFF') && header.slice(8,12) === 'WEBP' : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid) badRequest('unsupported_file_type');
  const id = crypto.randomUUID();
  const key = `source/${id}.${ext}`;
  await bucket(c, 'CASE_STUDIES').put(key, data, { httpMetadata: { contentType: type } });
  try {
    await db.insert(newsletterAssets).values({ id, key, filename: file.name.slice(0,255), contentType: type, bytes: file.size, createdBy: actor.person.id });
  } catch (err) {
    await bucket(c, 'CASE_STUDIES').delete(key);
    throw err;
  }
  return { id, url: assetUrl(key), filename: file.name.slice(0,255), bytes: file.size, contentType: type, emailEligible: file.size <= 3 * 1024 * 1024 };
});
