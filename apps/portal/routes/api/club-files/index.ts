import { defineHandler } from 'void';
import { bucket } from '../../../src/server/buckets';
import { type ClubFile, clubFileFromObject, isSharedFileCategory, type ListableBucket, matchesClubFileFilter, sharedFileObjects } from '../../../src/server/club-files';
import { requirePermission } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';

/** Shared club files, newest first, filtered like the old list endpoint. */
export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'files.view');
  const category = c.req.query('category') || '';
  if (category && !isSharedFileCategory(category)) badRequest('invalid_category');
  const filter = { eventName: c.req.query('eventName'), projectName: c.req.query('projectName'), search: c.req.query('search') };
  const files: ClubFile[] = [];
  const source = bucket(c, 'CLUB_FILES') as unknown as ListableBucket<R2Object>;
  for await (const object of sharedFileObjects(source, category || undefined)) {
    const file = clubFileFromObject(object);
    if (matchesClubFileFilter(file, filter)) files.push(file);
  }
  files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { files };
});
