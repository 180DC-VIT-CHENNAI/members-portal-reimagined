import { defineHandler } from 'void';
import { bucket } from '../../../../src/server/buckets';
import { downloadFileHeaders, sharedFileKeyById } from '../../../../src/server/club-files';
import { requirePermission } from '../../../../src/server/guard';
import { idParam, notFound } from '../../../../src/server/http';
import { latestDownload } from '../../../../src/server/document-versions';

/** The file as an attachment, never cached. */
export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'files.view');
  const files = bucket(c, 'CLUB_FILES');
  const key = await sharedFileKeyById(files, idParam(c));
  if (!key) notFound('file_not_found');
  const object = await files.get(key);
  if (!object) notFound('file_not_found');
  const name = object.customMetadata?.fileName || key.split('/')[1];
  return latestDownload(c, { id: idParam(c), key, fileName: name, contentType: object.httpMetadata?.contentType || 'application/octet-stream' });
});
