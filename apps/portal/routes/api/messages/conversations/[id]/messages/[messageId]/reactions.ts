import { defineHandler } from 'void';
import { routeParam } from '../../../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../../../src/server/guard';
import { idParam } from '../../../../../../../src/server/http';
import { conversationFor } from '../../../../../../../src/server/messaging/access';
import { messageOr404, reactionInput, toggleReaction } from '../../../../../../../src/server/messaging/messages';
import { rateLimit } from '../../../../../../../src/server/rate-limit';

/** Toggle the caller's reaction on a live message. */
export const POST = defineHandler.withValidator({ body: reactionInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  const conversation = await conversationFor(principal, idParam(c));
  const message = await messageOr404(conversation.id, routeParam(c, 'messageId'));
  await rateLimit(c, 'messages_write', 60, 60);
  return toggleReaction(principal, message, body.emoji);
});
