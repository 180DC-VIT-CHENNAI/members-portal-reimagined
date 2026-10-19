import { defineHandler } from 'void';
import { requirePrincipal } from '../../../src/server/guard';
import { createMailbox, listMailboxes } from '../../../src/server/mailboxes/management';
import { mailboxInput } from '../../../src/server/mailboxes/validation';
import { rateLimit } from '../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  c.header('Cache-Control', 'private, no-store');
  return { mailboxes: await listMailboxes(actor) };
});

export const POST = defineHandler.withValidator({ body: mailboxInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailboxes_create', 20, 3600);
  return c.json(await createMailbox(actor, body), 201);
});
