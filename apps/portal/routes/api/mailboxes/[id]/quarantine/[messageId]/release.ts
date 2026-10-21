import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../../src/server/http';
import { releaseQuarantine } from '../../../../../../src/server/mailboxes/quarantine';
import { rateLimit } from '../../../../../../src/server/rate-limit';

export const POST = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_quarantine', 60, 3600);
  return releaseQuarantine(actor, idParam(c), c.req.param('messageId') ?? notFound());
});
