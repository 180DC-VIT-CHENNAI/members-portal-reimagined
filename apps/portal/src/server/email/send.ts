import { dailyEmailCount, devOutbox, emailHourCount } from '@schema';
import { db, eq, sql } from 'void/db';
import { env } from 'void/env';
import { hourlyLimit } from './budget.ts';
import type { EmailMessage } from './mime.ts';
import { smtpSend } from './smtp.ts';
import { SmtpError } from './smtp-session.ts';

export type SendResult =
  | { readonly status: 'sent' }
  | { readonly status: 'failed'; readonly error: string }
  | { readonly status: 'paused'; readonly error: string };

/** Capture and redirect are development-only, even if a production secret enables them. */
export function emailTestMode(): 'capture' | 'redirect' | null {
  if (import.meta.env.PROD || env.ENVIRONMENT === 'production') return null;
  if (env.EMAIL_TEST_MODE === 'capture' || env.EMAIL_TEST_MODE === 'redirect') return env.EMAIL_TEST_MODE;
  return null;
}

export async function emailQuota(now = new Date()) {
  const hour = now.toISOString().slice(0, 13);
  const [row] = await db.select().from(emailHourCount).where(eq(emailHourCount.hour, hour));
  return { hour, count: row?.count ?? 0, limit: hourlyLimit(env.SPACEMAIL_HOURLY_LIMIT) };
}

/** One recipient per call, shared by direct sends and the campaign drain. */
export async function sendEmail(
  message: Omit<EmailMessage, 'to'> & { readonly to: string },
  campaign = false,
): Promise<SendResult> {
  const quota = await emailQuota();
  const ceiling = campaign ? quota.limit - Math.floor(quota.limit / 10) : quota.limit;
  if (quota.count >= ceiling) return { status: 'paused', error: 'hourly_limit' };
  const mode = emailTestMode();
  if (mode) {
    if (message.to.endsWith('@timeout.invalid')) return { status: 'paused', error: 'SMTP timeout' };
    if (message.to.endsWith('@reject.invalid')) return { status: 'failed', error: 'SMTP RCPT failed (550)' };
    if (message.to.endsWith('@tempfail.invalid')) return { status: 'failed', error: 'SMTP RCPT failed (450)' };
  }
  const smtpUser = env.SPACEMAIL_SMTP_USER;
  const smtpPassword = env.SPACEMAIL_SMTP_PASS;
  let redirectTo: string | null = null;
  if (mode === 'redirect') {
    const [previous] = await db.select({ id: devOutbox.id }).from(devOutbox)
      .where(eq(devOutbox.subject, message.subject)).limit(1);
    if (!previous) {
      if (!env.EMAIL_TEST_RECIPIENT) return { status: 'paused', error: 'test_recipient_not_configured' };
      redirectTo = env.EMAIL_TEST_RECIPIENT;
    }
  }
  if ((!mode || redirectTo) && (!smtpUser || !smtpPassword)) return { status: 'paused', error: 'smtp_not_configured' };
  // Reserve atomically before SMTP so concurrent direct sends/drains cannot exceed
  // the allowance. A crash may retain a reservation until the next hour, never oversend.
  const reserved = await db.insert(emailHourCount).values({ hour: quota.hour, count: 1 })
    .onConflictDoUpdate({
      target: emailHourCount.hour,
      set: { count: sql`${emailHourCount.count} + 1` },
      setWhere: sql`${emailHourCount.count} < ${ceiling}`,
    }).returning({ hour: emailHourCount.hour });
  if (!reserved.length) return { status: 'paused', error: 'hourly_limit' };
  let accepted = false;
  let providerLimited = false;
  try {
    if (mode && message.to.endsWith('@hourlimit.invalid')) throw new SmtpError('SMTP hourly limit reached', 550, 'quota');
    if ((!mode || redirectTo) && smtpUser && smtpPassword) {
      const result = await smtpSend(smtpUser, smtpPassword, {
        ...message,
        to: [redirectTo ?? message.to],
        subject: redirectTo ? `[To: ${message.to}] ${message.subject}` : message.subject,
      });
      if (!result.accepted.length) return { status: 'failed', error: result.error ?? 'recipient_rejected' };
      accepted = true;
    }
    if (mode) {
      await db.insert(devOutbox).values({
        recipient: message.to,
        fromAddress: message.from,
        subject: message.subject,
        html: message.html,
        headers: { ...message.extraHeaders },
        attachments: message.attachments?.map((a) => a.filename) ?? [],
        deliveredTo: redirectTo,
      });
      accepted = true;
    }
    const day = new Date().toISOString().slice(0, 10);
    await db.insert(dailyEmailCount).values({ date: day, count: 1 })
      .onConflictDoUpdate({ target: dailyEmailCount.date, set: { count: sql`${dailyEmailCount.count} + 1` } });
    return { status: 'sent' };
  } catch (error) {
    if (!(error instanceof SmtpError)) throw error;
    if (error.reason === 'quota') {
      await db.update(emailHourCount).set({ count: quota.limit }).where(eq(emailHourCount.hour, quota.hour));
      providerLimited = true;
      return { status: 'paused', error: error.message };
    }
    return { status: error.code && error.code >= 500 ? 'failed' : 'paused', error: error.message };
  } finally {
    if (!accepted && !providerLimited) await db.update(emailHourCount).set({ count: sql`max(0, ${emailHourCount.count} - 1)` })
      .where(eq(emailHourCount.hour, quota.hour));
  }
}
