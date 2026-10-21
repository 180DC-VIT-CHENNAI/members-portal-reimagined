import { defineHandler } from 'void';
import { audit } from '../../../../src/server/audit';
import { bucket } from '../../../../src/server/buckets';
import { sharedFileKeyById } from '../../../../src/server/club-files';
import { requirePermission } from '../../../../src/server/guard';
import { idParam, notFound } from '../../../../src/server/http';
import { rateLimit } from '../../../../src/server/rate-limit';
import { documents } from '@schema';
import { db, eq } from 'void/db';
import { assertDeletable } from '../../../../src/server/document-access';

export const DELETE = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'files.manage');
  await rateLimit(c, 'club_files_delete', 20, 3600);
  const id = idParam(c);
  const files = bucket(c, 'CLUB_FILES');
  const key = await sharedFileKeyById(files, id);
  if (!key) notFound('file_not_found');
  await assertDeletable(id);
  await files.delete(key);
  await db.delete(documents).where(eq(documents.id, id));
  await audit(actor.person.id, 'club_file.delete', 'club_file', id, { key });
  return null;
});
