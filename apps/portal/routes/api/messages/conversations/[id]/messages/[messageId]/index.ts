import { defineHandler } from 'void';
import { routeParam } from '../../../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../../../src/server/guard';
import { idParam } from '../../../../../../../src/server/http';
import { conversationFor } from '../../../../../../../src/server/messaging/access';
import { deleteOwnMessage, editInput, editMessage, messageOr404 } from '../../../../../../../src/server/messaging/messages';
import { rateLimit } from '../../../../../../../src/server/rate-limit';

/** Edit your own message within 15 minutes (403 for others' messages, 409 once the window closed). */
export const PATCH = defineHandler.withValidator({ body: editInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  const conversation = await conversationFor(principal, idParam(c));
  const message = await messageOr404(conversation.id, routeParam(c, 'messageId'));
  await rateLimit(c, 'messages_write', 60, 60);
  return editMessage(principal, conversation, message, body.body);
});

/** Delete your own message, leaving a tombstone; deleting again is a no-op. */
export const DELETE = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  const conversation = await conversationFor(principal, idParam(c));
  const message = await messageOr404(conversation.id, routeParam(c, 'messageId'));
  await rateLimit(c, 'messages_write', 60, 60);
  return deleteOwnMessage(principal, message);
});
