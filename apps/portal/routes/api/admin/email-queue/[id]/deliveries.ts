import { emailDeliveries, emailQueue } from '@schema';
import { defineHandler } from 'void';
import { db, desc, eq } from 'void/db';
import { requirePermission } from '../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../src/server/http';

export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'email.view');
  const id = idParam(c);
  const [campaign] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
  if (!campaign) notFound('campaign_not_found');
  const deliveries = await db.select().from(emailDeliveries).where(eq(emailDeliveries.campaignId, id))
    .orderBy(desc(emailDeliveries.updatedAt));
  return { campaign, deliveries };
});
