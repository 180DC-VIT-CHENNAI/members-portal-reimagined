import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { conversationFor } from '../../../../../src/server/messaging/access';
import { markConversationRead, readInput } from '../../../../../src/server/messaging/messages';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** Move the caller's read pointer up to `upTo`; mention notices up to it are read too. */
export const POST = defineHandler.withValidator({ body: readInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  const conversation = await conversationFor(principal, idParam(c));
  await rateLimit(c, 'messages_read', 240, 60);
  await markConversationRead(principal, conversation, body.upTo);
  return { ok: true };
});
