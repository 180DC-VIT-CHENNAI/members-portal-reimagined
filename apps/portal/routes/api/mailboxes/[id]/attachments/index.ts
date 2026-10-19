import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { upload } from '../../../../../src/server/mailboxes/files';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const POST = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_upload', 30, 3600);
  return c.json(await upload(c, actor, idParam(c)), 201);
});
