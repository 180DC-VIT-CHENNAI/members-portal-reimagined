import { defineHandler } from 'void';
import { requirePrincipal } from '../../../src/server/guard';
import { directInput, openDirect } from '../../../src/server/messaging/access';
import { rateLimit } from '../../../src/server/rate-limit';

/** Find or start the direct conversation with a current member. */
export const POST = defineHandler.withValidator({ body: directInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'messages_write', 60, 60);
  return openDirect(principal, body.personId);
});
