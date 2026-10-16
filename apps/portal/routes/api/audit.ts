import { auditLog } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, desc, eq, lt } from 'void/db';
import { requirePermission } from '../../src/server/guard';

/** Newest-first audit entries, optionally for one target, paged by id. */
export const GET = defineHandler.withValidator({
  query: v.object({
    targetType: v.optional(v.pipe(v.string(), v.maxLength(40))),
    targetId: v.optional(v.pipe(v.string(), v.maxLength(64))),
    before: v.optional(v.pipe(v.string(), v.toNumber(), v.integer())),
  }),
})(async (c, { query }) => {
  requirePermission(c, 'audit.view');
  const where = [];
  if (query.targetType) where.push(eq(auditLog.targetType, query.targetType));
  if (query.targetId) where.push(eq(auditLog.targetId, query.targetId));
  if (query.before) where.push(lt(auditLog.id, query.before));
  return db
    .select()
    .from(auditLog)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(100);
});
