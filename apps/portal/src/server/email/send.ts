import { dailyEmailCount, devOutbox, emailHourCount } from '@schema';
import { db, eq, sql } from 'void/db';
import { type Attachment, sendEmail as deliver } from 'void/email';
import { env } from 'void/env';
import { hourlyLimit } from './budget.ts';
import { classifySend, simulatedResult } from './outcome.ts';
import { htmlToPlainText } from './plain-text.ts';

export type OutgoingEmail = {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  /** Where replies go; the sending address receives nothing. */
  readonly replyTo?: string;
  readonly attachments?: readonly Attachment[];
  readonly headers?: Readonly<Record<string, string>>;
};

export type SendResult =
  | { readonly status: 'sent' }
  | { readonly status: 'failed'; readonly error: string }
  | { readonly status: 'paused'; readonly error: string };

/** Capture is development-only, even if a production secret enables it. */
export function emailTestMode(): 'capture' | null {
  if (import.meta.env.PROD || env.ENVIRONMENT === 'production') return null;
  return env.EMAIL_TEST_MODE === 'capture' ? 'capture' : null;
}

export async function emailQuota(now = new Date()) {
  const hour = now.toISOString().slice(0, 13);
  const [row] = await db.select().from(emailHourCount).where(eq(emailHourCount.hour, hour));
  return { hour, count: row?.count ?? 0, limit: hourlyLimit(env.EMAIL_HOURLY_LIMIT) };
}

/**
 * Send to one recipient through Cloudflare Email Sending (`sendEmail` from
 * void/email; Void's dev inbox under `pnpm dev`). Shared by direct sends and
 * the campaign drain. Capture mode records to dev_outbox instead and
 * simulates provider failures (outcome.ts).
 */
export async function sendEmail(message: OutgoingEmail, campaign = false): Promise<SendResult> {
  const quota = await emailQuota();
  const ceiling = campaign ? quota.limit - Math.floor(quota.limit / 10) : quota.limit;
  if (quota.count >= ceiling) return { status: 'paused', error: 'hourly_limit' };
  // Reserve atomically before sending so concurrent direct sends/drains cannot exceed
  // the allowance. A crash may retain a reservation until the next hour, never oversend.
  const reserved = await db.insert(emailHourCount).values({ hour: quota.hour, count: 1 })
    .onConflictDoUpdate({
      target: emailHourCount.hour,
      set: { count: sql`${emailHourCount.count} + 1` },
      setWhere: sql`${emailHourCount.count} < ${ceiling}`,
    }).returning({ hour: emailHourCount.hour });
  if (!reserved.length) return { status: 'paused', error: 'hourly_limit' };
  let keepReservation = false;
  try {
    const capture = emailTestMode() === 'capture';
    const outcome = classifySend(capture ? simulatedResult(message.to) : await deliver({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: htmlToPlainText(message.html),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.headers ? { headers: { ...message.headers } } : {}),
      ...(message.attachments?.length ? { attachments: [...message.attachments] } : {}),
    }));
    switch (outcome.status) {
      case 'sent': {
        keepReservation = true;
        if (capture) {
          await db.insert(devOutbox).values({
            recipient: message.to,
            fromAddress: message.from,
            subject: message.subject,
            html: message.html,
            headers: { ...message.headers, ...(message.replyTo ? { 'Reply-To': message.replyTo } : {}) },
            attachments: message.attachments?.map((a) => a.filename) ?? [],
          });
        }
        const day = new Date().toISOString().slice(0, 10);
        await db.insert(dailyEmailCount).values({ date: day, count: 1 })
          .onConflictDoUpdate({ target: dailyEmailCount.date, set: { count: sql`${dailyEmailCount.count} + 1` } });
        return { status: 'sent' };
      }
      case 'paused':
        if (outcome.quota) {
          // Cloudflare's own limit: stop sending for the rest of this hour.
          keepReservation = true;
          await db.update(emailHourCount).set({ count: quota.limit }).where(eq(emailHourCount.hour, quota.hour));
        }
        return { status: 'paused', error: outcome.error };
      case 'failed':
        // An unknown outcome may still have been accepted, so it keeps its slot.
        keepReservation = outcome.mayHaveSent;
        return { status: 'failed', error: outcome.error };
      default: {
        const unhandled: never = outcome;
        throw new Error(`Unhandled send outcome: ${JSON.stringify(unhandled)}`);
      }
    }
  } finally {
    if (!keepReservation) {
      await db.update(emailHourCount).set({ count: sql`max(0, ${emailHourCount.count} - 1)` })
        .where(eq(emailHourCount.hour, quota.hour));
    }
  }
}
