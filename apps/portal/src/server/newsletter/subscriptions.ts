import { newsletterSubscribers } from '@schema';
import type { Context } from 'hono';
import { and, db, eq, gt, ne } from 'void/db';
import { enqueueEmailCampaign } from '../email/queue.ts';
import { sendEmail, type OutgoingEmail } from '../email/send.ts';
import { sender } from '../email/sender.ts';
import { badRequest, forbidden } from '../http.ts';
import { randomToken, tokenHash } from '../tokens.ts';
import { confirmHtml, unsubscribeHeaders, unsubscribeLinkHtml, welcomeHtml } from './mail.ts';

/** Cross-site browser forms cannot change subscriptions; mail-client one-click requests have no Origin. */
export function subscriptionOrigin(c: Context): string {
  const origin = new URL(c.req.url).origin;
  const supplied = c.req.header('Origin');
  if (supplied && supplied !== origin) forbidden('forbidden_origin');
  return origin;
}

/** Direct transactional mail uses the reserved allowance; temporary outages defer to the existing queue. */
async function subscriptionMail(message: OutgoingEmail): Promise<void> {
  const outcome = await sendEmail(message);
  switch (outcome.status) {
    case 'sent': return;
    case 'paused':
      await enqueueEmailCampaign({ kind: 'subscription', fromAddress: message.from, recipients: [message.to], subject: message.subject, html: message.html, meta: { headers: message.headers ?? {} } });
      return;
    case 'failed':
      console.warn(JSON.stringify({ event: 'subscription_mail_failed', error: outcome.error }));
      return;
    default: {
      const unhandled: never = outcome;
      return unhandled;
    }
  }
}

export async function subscribe(origin: string, email: string, name: string | null): Promise<void> {
  const token = randomToken(32);
  const hash = await tokenHash(token);
  const expires = new Date(Date.now() + 48 * 3_600_000).toISOString();
  const [pending] = await db.insert(newsletterSubscribers).values({
    id: crypto.randomUUID(), email, name, unsubscribeToken: randomToken(24), confirmTokenHash: hash, confirmExpiresAt: expires,
  }).onConflictDoUpdate({
    target: newsletterSubscribers.email,
    set: { name, status: 'pending', confirmTokenHash: hash, confirmExpiresAt: expires },
    setWhere: ne(newsletterSubscribers.status, 'active'),
  }).returning({ id: newsletterSubscribers.id });
  // Same public result for an active subscriber, without changing their name or sending mail.
  if (!pending) return;
  await subscriptionMail({ from: sender('180DC Newsletter'), to: email, subject: 'Confirm your 180DC newsletter subscription', html: confirmHtml(`${origin}/subscriber?confirm=${token}`) });
}

export async function confirm(origin: string, token: string): Promise<{ welcomeBack: boolean }> {
  const now = new Date().toISOString();
  const [confirmed] = await db.update(newsletterSubscribers).set({
    status: 'active', confirmedAt: now, confirmTokenHash: null, confirmExpiresAt: null,
  }).where(and(eq(newsletterSubscribers.confirmTokenHash, await tokenHash(token)), gt(newsletterSubscribers.confirmExpiresAt, now)))
    .returning({ email: newsletterSubscribers.email, token: newsletterSubscribers.unsubscribeToken, previousUnsubscribe: newsletterSubscribers.lastUnsubscribedAt });
  if (!confirmed) badRequest('confirmation_invalid');
  const welcomeBack = confirmed.previousUnsubscribe !== null;
  await subscriptionMail({ from: sender('180DC Newsletter'), to: confirmed.email,
    subject: welcomeBack ? 'Welcome back to the 180DC Newsletter!' : 'Welcome to the 180DC Newsletter!',
    html: welcomeHtml(origin, confirmed.token, welcomeBack), headers: unsubscribeHeaders(origin, confirmed.token) });
  return { welcomeBack };
}

export async function unsubscribe(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) badRequest('unsubscribe_invalid');
  const [removed] = await db.update(newsletterSubscribers).set({
    status: 'unsubscribed', lastUnsubscribedAt: new Date().toISOString(), confirmTokenHash: null, confirmExpiresAt: null,
  }).where(and(eq(newsletterSubscribers.unsubscribeToken, token), ne(newsletterSubscribers.status, 'unsubscribed'))).returning({ email: newsletterSubscribers.email });
  if (removed) return { status: 'unsubscribed' as const, email: removed.email };
  const [found] = await db.select({ email: newsletterSubscribers.email }).from(newsletterSubscribers).where(eq(newsletterSubscribers.unsubscribeToken, token));
  return found ? { status: 'already' as const, email: found.email } : { status: 'not_found' as const, email: null };
}

/** Email-entry unsubscribe requests send a capability, rather than letting anyone remove someone else's address. */
export async function requestUnsubscribe(origin: string, email: string): Promise<void> {
  const [found] = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email));
  if (found && found.status !== 'unsubscribed') await subscriptionMail({
    from: sender('180DC Newsletter'), to: email, subject: 'Your 180DC newsletter unsubscribe link', html: unsubscribeLinkHtml(origin, found.unsubscribeToken),
  });
}
