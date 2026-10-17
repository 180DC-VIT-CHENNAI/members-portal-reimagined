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

export interface AuditEntry {
  actorPersonId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details?: Record<string, unknown>;
}

/** Append several entries, 15 rows per insert to stay under D1's 100 bound parameters. */
export async function auditMany(entries: readonly AuditEntry[]): Promise<void> {
  for (let i = 0; i < entries.length; i += 15) {
    await db.insert(auditLog).values(entries.slice(i, i + 15).map((entry) => ({ ...entry, details: entry.details ?? null })));
  }
}
