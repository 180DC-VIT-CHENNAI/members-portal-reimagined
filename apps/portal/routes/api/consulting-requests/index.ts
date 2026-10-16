import { consultingRequests, consultingResponses } from '@schema';
import { defineHandler } from 'void';
import { asc, db, desc } from 'void/db';
import { requirePermission } from '../../../src/server/guard';

/** Every request, newest first, with the reply recorded when it was decided. */
export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'consulting.manage');
  const [requests, responses] = await Promise.all([
    db.select().from(consultingRequests).orderBy(desc(consultingRequests.createdAt), asc(consultingRequests.id)),
    db.select().from(consultingResponses).orderBy(asc(consultingResponses.sentAt)),
  ]);
  const replyFor = new Map(responses.map((r) => [r.requestId, { emailSubject: r.emailSubject, emailBody: r.emailBody, sentAt: r.sentAt }]));
  return requests.map((r) => ({ ...r, response: replyFor.get(r.id) ?? null }));
});
