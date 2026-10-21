import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../../src/server/http';
import { conversationDetail } from '../../../../../../src/server/mailboxes/inbox-read';
import { triageConversation } from '../../../../../../src/server/mailboxes/inbox-actions';
import { triageInput } from '../../../../../../src/server/mailboxes/inbox-validation';
import { rateLimit } from '../../../../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  c.header('Cache-Control', 'private, no-store');
  return conversationDetail(await requirePrincipal(c), idParam(c), c.req.param('conversationId') ?? notFound(), c.req.query('before'));
});
export const PATCH = defineHandler.withValidator({ body: triageInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_triage', 120, 3600);
  return triageConversation(actor, { mailboxId: idParam(c), conversationId: c.req.param('conversationId') ?? notFound(), body });
});
