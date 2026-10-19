import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { mailboxFor } from '../../../../src/server/mailboxes/access';
import { updatePolicy } from '../../../../src/server/mailboxes/management';
import { policyInput } from '../../../../src/server/mailboxes/validation';
import { rateLimit } from '../../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  c.header('Cache-Control', 'private, no-store');
  const access = await mailboxFor(await requirePrincipal(c), idParam(c));
  // Void's JSON type projection recognizes mutable arrays, not readonly arrays.
  return { mailbox: { ...access.mailbox, categoryPolicy: [...access.mailbox.categoryPolicy] }, capabilities: [...access.capabilities] };
});
export const PATCH = defineHandler.withValidator({ body: policyInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_management', 60, 3600);
  return updatePolicy(actor, idParam(c), body);
});
