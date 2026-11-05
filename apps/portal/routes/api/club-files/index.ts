import { defineHandler } from 'void';
import { bucket } from '../../../src/server/buckets';
import { type ClubFile, clubFileFromObject, isSharedFileCategory, type ListableBucket, matchesClubFileFilter, sharedFileObjects } from '../../../src/server/club-files';
import { requirePermission } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';
import { documents, documentVersions } from '@schema';
import { and, db, eq } from 'void/db';

/** Shared club files, newest first, filtered like the old list endpoint. */
export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'files.view');
  const category = c.req.query('category') || '';
  if (category && !isSharedFileCategory(category)) badRequest('invalid_category');
  const filter = { eventName: c.req.query('eventName'), projectName: c.req.query('projectName'), search: c.req.query('search') };
  const files: ClubFile[] = [];
  const heads = await db.select({ id: documents.id, version: documentVersions }).from(documents)
    .innerJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.number, documents.revision)));
  const latest = new Map(heads.map((head) => [head.id, head.version]));
  const source = bucket(c, 'CLUB_FILES') as unknown as ListableBucket<R2Object>;
  for await (const object of sharedFileObjects(source, category || undefined)) {
    const file = clubFileFromObject(object);
    const version = latest.get(file.id);
    if (version) {
      file.fileName = version.fileName;
      file.fileSize = version.bytes;
      file.fileType = version.contentType;
    }
    if (matchesClubFileFilter(file, filter)) files.push(file);
  }
  files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { files };
});
