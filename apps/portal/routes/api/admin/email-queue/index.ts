import { emailQueue } from '@schema';
import { defineHandler } from 'void';
import { db, desc, sql } from 'void/db';
import { requirePermission } from '../../../../src/server/guard';
import { emailQuota } from '../../../../src/server/email/send';

export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'email.view');
  const quota = await emailQuota();
  const counts = await db.select({ status: emailQueue.status, count: sql<number>`count(*)` })
    .from(emailQueue).groupBy(emailQueue.status);
  const recent = await db.select().from(emailQueue).orderBy(desc(emailQueue.createdAt), desc(emailQueue.id)).limit(10);
  return { hourlyCount: quota.count, hourlyLimit: quota.limit, counts, recent };
});
