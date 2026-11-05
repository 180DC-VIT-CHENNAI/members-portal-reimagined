import { githubWebhookDeliveries } from '@schema';
import { db, eq, sql } from 'void/db';
import type { DeliveryStatus } from '../types.ts';

export interface DeliveryClaim {
  readonly id: string;
  readonly event: string;
  readonly action: string | null;
  readonly installationId: number | null;
  readonly repositoryId: number | null;
  readonly payloadSha256: string;
}

/**
 * Takes the ledger row of an X-GitHub-Delivery. True only for a new delivery,
 * a `failed` one, or a `processing` one claimed over 5 minutes ago; anything
 * else is a duplicate. A single upsert, so concurrent duplicates claim once.
 */
export async function claimDelivery(claim: DeliveryClaim): Promise<boolean> {
  const rows = await db
    .insert(githubWebhookDeliveries)
    .values(claim)
    .onConflictDoUpdate({
      target: githubWebhookDeliveries.id,
      set: {
        status: 'processing',
        attempts: sql`${githubWebhookDeliveries.attempts} + 1`,
        claimedAt: sql`datetime('now')`,
        detail: null,
      },
      setWhere: sql`${githubWebhookDeliveries.status} = 'failed' OR (${githubWebhookDeliveries.status} = 'processing' AND ${githubWebhookDeliveries.claimedAt} < datetime('now', '-5 minutes'))`,
    })
    .returning({ id: githubWebhookDeliveries.id });
  return rows.length > 0;
}

export async function finishDelivery(id: string, status: Exclude<DeliveryStatus, 'processing'>, detail: string | null): Promise<void> {
  await db
    .update(githubWebhookDeliveries)
    .set({ status, detail, processedAt: sql`datetime('now')` })
    .where(eq(githubWebhookDeliveries.id, id));
}
