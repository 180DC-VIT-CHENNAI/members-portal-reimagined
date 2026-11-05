import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../../../src/server/http';
import { downloadInbound } from '../../../../../../../src/server/mailboxes/inbox-read';

export const GET = defineHandler(async (c) => downloadInbound(c, await requirePrincipal(c), {
  mailboxId: idParam(c), conversationId: c.req.param('conversationId') ?? notFound(), attachmentId: c.req.param('attachmentId') ?? notFound(),
}));
