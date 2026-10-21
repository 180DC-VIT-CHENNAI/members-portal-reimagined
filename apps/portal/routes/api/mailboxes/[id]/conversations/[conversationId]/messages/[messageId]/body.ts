import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../../../../src/server/http';
import { messageBody } from '../../../../../../../../src/server/mailboxes/inbox-read';

export const GET = defineHandler(async (c) => {
  c.header('Cache-Control', 'private, no-store');
  return messageBody(c, await requirePrincipal(c), {
    mailboxId: idParam(c), conversationId: c.req.param('conversationId') ?? notFound(),
    messageId: c.req.param('messageId') ?? notFound(), remote: c.req.query('remote') === '1',
  });
});
