import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../../src/server/http';
import { deleteQuarantine, quarantineHeaders } from '../../../../../../src/server/mailboxes/quarantine';
import { rateLimit } from '../../../../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  c.header('Cache-Control', 'private, no-store');
  return quarantineHeaders(c, await requirePrincipal(c), { mailboxId: idParam(c), messageId: c.req.param('messageId') ?? notFound() });
});
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_quarantine', 60, 3600);
  return deleteQuarantine(c, actor, { mailboxId: idParam(c), messageId: c.req.param('messageId') ?? notFound() });
});
