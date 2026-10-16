import { auditLog } from '@schema';
import { db } from 'void/db';

/** Append one entry to the audit log. */
export async function audit(
  actorPersonId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({ actorPersonId, action, targetType, targetId, details: details ?? null });
}
