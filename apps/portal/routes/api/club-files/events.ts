import { defineHandler } from 'void';
import { bucket } from '../../../src/server/buckets';
import { type ListableBucket, sharedFileObjects } from '../../../src/server/club-files';
import { requirePermission } from '../../../src/server/guard';

/** Distinct event names on event files, for the filter list. */
export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'files.view');
  const names = new Set<string>();
  for await (const object of sharedFileObjects(bucket(c, 'CLUB_FILES') as unknown as ListableBucket<R2Object>, 'events')) {
    if (object.customMetadata?.eventName) names.add(object.customMetadata.eventName);
  }
  return { events: [...names].sort() };
});
