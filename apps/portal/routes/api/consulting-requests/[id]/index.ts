import { consultingRequests, consultingResponses } from '@schema';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePermission } from '../../../../src/server/guard';
import { idParam, notFound } from '../../../../src/server/http';

/** Delete a request (any status) and its recorded reply. */
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'consulting.manage');
  const id = idParam(c);
  const [request] = await db.select({ id: consultingRequests.id, organization: consultingRequests.organization }).from(consultingRequests).where(eq(consultingRequests.id, id));
  if (!request) notFound('request_not_found');
  await db.batch([db.delete(consultingResponses).where(eq(consultingResponses.requestId, id)), db.delete(consultingRequests).where(eq(consultingRequests.id, id))]);
  await audit(actor.person.id, 'consulting.delete', 'consulting_request', id, { organization: request.organization });
  return null;
});
