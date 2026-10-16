import { HTTPException } from 'hono/http-exception';
import { defineHandler } from 'void';
import { audit } from '../../../../../src/server/audit';
import { retryFailedCampaign } from '../../../../../src/server/email/queue';
import { requirePermission } from '../../../../../src/server/guard';
import { badRequest, idParam, notFound } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const POST = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'email.manage', null);
  await rateLimit(c, 'email_retry', 30, 3600);
  const id = idParam(c);
  const result = await retryFailedCampaign(id);
  if (result === 'missing') notFound('campaign_not_found');
  if (result === 'sending') throw new HTTPException(409, { message: 'campaign_still_sending' });
  if (result === 'no_failures') badRequest('campaign_has_no_failures');
  await audit(actor.person.id, 'email.retry', 'email_campaign', id, { retrying: result });
  return { retrying: result };
});
