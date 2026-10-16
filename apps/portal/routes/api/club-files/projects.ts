import { defineHandler } from 'void';
import { bucket } from '../../../src/server/buckets';
import { type ListableBucket, sharedFileObjects } from '../../../src/server/club-files';
import { requirePermission } from '../../../src/server/guard';

/** Distinct project names on project files, for the filter list. */
export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'files.view');
  const names = new Set<string>();
  for await (const object of sharedFileObjects(bucket(c, 'CLUB_FILES') as unknown as ListableBucket<R2Object>, 'projects')) {
    if (object.customMetadata?.projectName) names.add(object.customMetadata.projectName);
  }
  return { projects: [...names].sort() };
});
