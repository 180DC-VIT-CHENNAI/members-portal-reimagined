import { defineHandler } from 'void';
import { routeParam } from '../../../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../../../src/server/guard';
import { idParam } from '../../../../../../../src/server/http';
import { conversationFor } from '../../../../../../../src/server/messaging/access';
import { messageOr404 } from '../../../../../../../src/server/messaging/messages';
import { reportInput, reportMessage } from '../../../../../../../src/server/messaging/reports';
import { rateLimit } from '../../../../../../../src/server/rate-limit';

/** Report someone else's message to moderators. */
export const POST = defineHandler.withValidator({ body: reportInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  const conversation = await conversationFor(principal, idParam(c));
  const message = await messageOr404(conversation.id, routeParam(c, 'messageId'));
  await rateLimit(c, 'messages_report', 10, 60);
  return c.json(await reportMessage(principal, message, body.reason), 201);
});
