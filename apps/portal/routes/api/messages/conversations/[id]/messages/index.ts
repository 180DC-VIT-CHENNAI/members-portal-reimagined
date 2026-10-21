import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { idParam } from '../../../../../../src/server/http';
import { conversationFor } from '../../../../../../src/server/messaging/access';
import { messagesPage, pageQuery, sendInput, sendMessage } from '../../../../../../src/server/messaging/messages';
import { rateLimit } from '../../../../../../src/server/rate-limit';

/** Messages newest first, 50 at a time; `?before=<id>` for older ones. */
export const GET = defineHandler.withValidator({ query: pageQuery })(async (c, { query }) => {
  const principal = await requirePrincipal(c);
  const conversation = await conversationFor(principal, idParam(c));
  await rateLimit(c, 'messages_read', 240, 60);
  c.header('Cache-Control', 'private, no-store');
  return messagesPage(principal, conversation, query.before);
});

/** Post a message; a repeated requestId returns the first one. */
export const POST = defineHandler.withValidator({ body: sendInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  const conversation = await conversationFor(principal, idParam(c));
  await rateLimit(c, 'messages_write', 60, 60);
  c.header('Cache-Control', 'private, no-store');
  return c.json(await sendMessage(principal, conversation, body), 201);
});
