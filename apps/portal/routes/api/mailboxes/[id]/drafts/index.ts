import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { createDraft, listDrafts } from '../../../../../src/server/mailboxes/drafts';
import { draftInput, draftQuery } from '../../../../../src/server/mailboxes/validation';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const GET = defineHandler.withValidator({ query: draftQuery })(async (c, { query }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_read', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  return listDrafts(actor, idParam(c), query);
});
export const POST = defineHandler.withValidator({ body: draftInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_drafts', 60, 3600);
  return c.json(await createDraft(actor, idParam(c), { body, conversationId: null }), 201);
});
