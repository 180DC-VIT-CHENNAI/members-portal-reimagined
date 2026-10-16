import { consultingRequests, consultingResponses } from '@schema';
import type { Context } from 'hono';
import { and, db, eq } from 'void/db';
import { audit } from './audit';
import { requirePermission } from './guard';
import { badRequest, idParam, notFound } from './http';
import { rateLimit } from './rate-limit';

/**
 * Accept or reject a pending request and record the reply. Sending the reply
 * by email arrives with the email queue (port plan slice 7), so emailSent is
 * false for now; the reply text is kept with the request.
 */
export async function decideRequest(c: Context, decision: 'accepted' | 'rejected', reply: { emailSubject: string; emailBody: string }) {
  const actor = await requirePermission(c, 'consulting.manage');
  await rateLimit(c, decision === 'accepted' ? 'consulting_accept' : 'consulting_reject', 10, 3600);
  const id = idParam(c);
  const [request] = await db.select().from(consultingRequests).where(eq(consultingRequests.id, id));
  if (!request) notFound('request_not_found');
  if (request.status !== 'pending') badRequest('request_already_processed');
  const [updated] = await db
    .update(consultingRequests)
    .set({ status: decision, decidedBy: actor.person.id, decidedAt: new Date().toISOString() })
    .where(and(eq(consultingRequests.id, id), eq(consultingRequests.status, 'pending')))
    .returning({ id: consultingRequests.id });
  if (!updated) badRequest('request_already_processed');
  await db.insert(consultingResponses).values({ id: crypto.randomUUID(), requestId: id, ...reply, sentBy: actor.person.id });
  await audit(actor.person.id, `consulting.${decision === 'accepted' ? 'accept' : 'reject'}`, 'consulting_request', id, { subject: reply.emailSubject });
  return { id, status: decision, emailSent: false as const };
}
