import { emailDeliveries, emailQueue, newsletters, newsletterSubscribers } from '@schema';
import { unsubscribeHeaders, unsubscribeUrl, UNSUBSCRIBE_MARKER } from '../newsletter/mail.ts';
import { and, asc, db, eq, inArray, or, sql } from 'void/db';
import type { Attachment } from 'void/email';
import { campaignBudget } from './budget.ts';
import { emailQuota, emailTestMode, sendEmail } from './send.ts';

type NewCampaign = Pick<typeof emailQueue.$inferInsert, 'kind' | 'fromAddress' | 'subject' | 'html' | 'recipients'> &
  Partial<Pick<typeof emailQueue.$inferInsert, 'attachments' | 'meta' | 'createdBy'>>;

export async function enqueueEmailCampaign(input: NewCampaign): Promise<string> {
  const recipients = [...new Set(input.recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const id = crypto.randomUUID();
  await db.insert(emailQueue).values({
    ...input, id, recipients, total: recipients.length,
    status: recipients.length ? 'pending' : 'done',
    finishedAt: recipients.length ? null : new Date().toISOString(),
  });
  return id;
}

export async function retryFailedCampaign(id: string): Promise<'missing' | 'sending' | 'no_failures' | number> {
  const [campaign] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
  if (!campaign) return 'missing';
  if (campaign.status === 'pending' || campaign.status === 'processing') return 'sending';
  const failures = await db.select().from(emailDeliveries)
    .where(and(eq(emailDeliveries.campaignId, id), eq(emailDeliveries.status, 'failed')));
  if (!failures.length && campaign.status !== 'failed') return 'no_failures';
  const updated = await db.update(emailQueue).set({
    cursor: 0, failed: 0, attempts: 0, status: 'pending', lastError: null, finishedAt: null,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(emailQueue.id, id), inArray(emailQueue.status, ['done', 'failed']))).returning({ id: emailQueue.id });
  return updated.length ? failures.length : 'sending';
}

function eligible() {
  return or(
    eq(emailQueue.status, 'pending'),
    and(eq(emailQueue.status, 'processing'), sql`julianday(${emailQueue.updatedAt}) < julianday('now', '-10 minutes')`),
  );
}

/** Process one claimed campaign. The awaited return is the cron completion signal. */
export async function drainEmailQueue(
  attachmentsBucket: R2Bucket,
  delay: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
  await db.update(emailQueue).set({
    status: 'failed', lastError: 'max attempts reached', finishedAt: new Date().toISOString(),
  }).where(and(eligible(), sql`${emailQueue.attempts} >= 5`));
  await db.delete(emailQueue).where(and(
    inArray(emailQueue.status, ['done', 'failed']),
    sql`julianday(${emailQueue.finishedAt}) < julianday('now', '-30 days')`,
  ));
  await db.delete(emailDeliveries).where(sql`NOT EXISTS (
    SELECT 1 FROM email_queue WHERE email_queue.id = ${emailDeliveries.campaignId}
  )`);
  const quota = await emailQuota();
  const budget = campaignBudget(quota.limit, quota.count, new Date());
  if (!budget) return { sent: 0, failed: 0, skippedByQuota: true };
  const [oldest] = await db.select({ id: emailQueue.id }).from(emailQueue)
    .where(eligible()).orderBy(asc(emailQueue.createdAt), asc(emailQueue.id)).limit(1);
  if (!oldest) return { sent: 0, failed: 0 };
  const [campaign] = await db.update(emailQueue).set({
    status: 'processing', attempts: sql`${emailQueue.attempts} + 1`, updatedAt: sql`datetime('now')`,
  }).where(and(eq(emailQueue.id, oldest.id), eligible())).returning();
  if (!campaign) return { sent: 0, failed: 0 };

  const deliveries = await db.select().from(emailDeliveries).where(eq(emailDeliveries.campaignId, campaign.id));
  const settled = new Set(deliveries.filter((d) => d.status !== 'failed').map((d) => d.recipient));
  const attachments: Attachment[] = [];
  for (const reference of campaign.attachments ?? []) {
    try {
      const object = await attachmentsBucket.get(reference.key);
      if (!object) {
        console.warn(JSON.stringify({ event: 'email_attachment_missing', campaignId: campaign.id, key: reference.key }));
        if (reference.required) {
          await db.update(emailQueue).set({ status: 'failed', failed: campaign.total, lastError: 'required_attachment_missing', finishedAt: new Date().toISOString() }).where(eq(emailQueue.id, campaign.id));
          return { campaignId: campaign.id, sent: 0, failed: campaign.total };
        }
        continue;
      }
      attachments.push({ filename: reference.filename, content: await object.arrayBuffer(), contentType: reference.contentType });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      console.warn(JSON.stringify({ event: 'email_attachment_unreadable', campaignId: campaign.id, key: reference.key }));
      if (reference.required) {
        await db.update(emailQueue).set({ status: 'pending', lastError: 'required_attachment_unreadable' }).where(eq(emailQueue.id, campaign.id));
        return { campaignId: campaign.id, sent: 0, failed: 0 };
      }
    }
  }
  const meta = campaign.meta ?? {};
  const replyTo = typeof meta.replyTo === 'string' ? meta.replyTo : undefined;
  const headers = typeof meta.headers === 'object' && meta.headers !== null
    ? Object.fromEntries(Object.entries(meta.headers).flatMap(([key, value]) => typeof value === 'string' ? [[key, value]] : []))
    : undefined;
  let cursor = campaign.cursor;
  let sent = 0;
  let failed = 0;
  let attempts = 0;
  let lastError: string | null = null;
  while (cursor < campaign.recipients.length && attempts < budget) {
    const recipient = campaign.recipients[cursor];
    if (settled.has(recipient)) { cursor++; continue; }
    if (attempts && !emailTestMode()) await delay(1500);
    attempts++;
    let html = campaign.html;
    let recipientHeaders = headers;
    if (meta.audience === 'subscribers' && typeof meta.origin === 'string') {
      // Re-check immediately before each send, not merely when the audience was queued.
      const [subscriber] = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, recipient));
      if (!subscriber || subscriber.status !== 'active') {
        await db.insert(emailDeliveries).values({ campaignId: campaign.id, recipient, status: 'skipped', error: 'unsubscribed', attempts: 0 })
          .onConflictDoUpdate({ target: [emailDeliveries.campaignId, emailDeliveries.recipient], set: { status: 'skipped', error: 'unsubscribed', updatedAt: sql`datetime('now')` } });
        cursor++;
        continue;
      }
      html = html.split(UNSUBSCRIBE_MARKER).join(unsubscribeUrl(meta.origin, subscriber.unsubscribeToken));
      recipientHeaders = { ...headers, ...unsubscribeHeaders(meta.origin, subscriber.unsubscribeToken) };
    }
    const result = await sendEmail({
      from: campaign.fromAddress, to: recipient, subject: campaign.subject, html, replyTo, attachments, headers: recipientHeaders,
    }, true);
    if (result.status === 'paused') { lastError = result.error; break; }
    const status = result.status;
    const error = status === 'failed' ? result.error : null;
    const sentAt = status === 'sent' ? new Date().toISOString() : null;
    await db.insert(emailDeliveries).values({
      campaignId: campaign.id, recipient, status, error, sentAt, attempts: 1,
    }).onConflictDoUpdate({
      target: [emailDeliveries.campaignId, emailDeliveries.recipient],
      set: { status, error, sentAt, attempts: sql`${emailDeliveries.attempts} + 1`, updatedAt: sql`datetime('now')` },
    });
    if (status === 'sent') sent++;
    else { failed++; lastError = error; }
    cursor++;
  }
  const done = cursor >= campaign.recipients.length;
  await db.update(emailQueue).set({
    cursor,
    sent: campaign.sent + sent,
    failed: campaign.failed + failed,
    attempts: cursor > campaign.cursor ? 0 : campaign.attempts,
    status: done ? 'done' : 'pending',
    lastError,
    updatedAt: sql`datetime('now')`,
    finishedAt: done ? new Date().toISOString() : null,
  }).where(eq(emailQueue.id, campaign.id));
  if (done && typeof meta.newsletterId === 'string' && campaign.kind === 'newsletter') {
    const accepted = campaign.sent + sent;
    await db.update(newsletters).set({
      broadcastId: null,
      ...(accepted > 0 ? { sentAt: sql`COALESCE(${newsletters.sentAt}, datetime('now'))`, recipientCount: accepted } : {}),
    }).where(eq(newsletters.id, meta.newsletterId));
  }
  return { campaignId: campaign.id, sent, failed };
}
