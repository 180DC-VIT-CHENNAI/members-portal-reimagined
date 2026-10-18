import { projectFileDeletions } from '@schema';
import { asc, db, inArray } from 'void/db';

/** Durable deletion intent survives a failed bucket operation or Worker restart. */
export async function drainProjectFileDeletions(files: Pick<R2Bucket, 'delete'>) {
  const rows = await db.select().from(projectFileDeletions).orderBy(asc(projectFileDeletions.createdAt), asc(projectFileDeletions.key)).limit(100);
  if (!rows.length) return 0;
  const keys = rows.map((row) => row.key);
  await files.delete(keys);
  await db.delete(projectFileDeletions).where(inArray(projectFileDeletions.key, keys));
  return keys.length;
}
