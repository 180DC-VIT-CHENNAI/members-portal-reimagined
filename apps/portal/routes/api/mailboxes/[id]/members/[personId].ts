import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../src/server/http';
import { setMembership } from '../../../../../src/server/mailboxes/management';
import { membershipInput } from '../../../../../src/server/mailboxes/validation';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const PUT = defineHandler.withValidator({ body: membershipInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_management', 60, 3600);
  return setMembership(actor, idParam(c), c.req.param('personId') ?? notFound(), body);
});
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_management', 60, 3600);
  return setMembership(actor, idParam(c), c.req.param('personId') ?? notFound(), { capabilities: [], validUntil: null });
});
