import { defineHandler } from 'void';
import { requirePrincipal } from '../../../src/server/guard';
import { channelInput, openChannel } from '../../../src/server/messaging/access';
import { rateLimit } from '../../../src/server/rate-limit';

/** Find or create a department or project channel the caller can read. */
export const POST = defineHandler.withValidator({ body: channelInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'messages_write', 60, 60);
  return openChannel(principal, body);
});
