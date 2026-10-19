import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../../src/server/http';
import { draftFor, draftHistory, editDraft } from '../../../../../../src/server/mailboxes/drafts';
import { cancelDraft } from '../../../../../../src/server/mailboxes/intents';
import { editDraftInput } from '../../../../../../src/server/mailboxes/validation';
import { rateLimit } from '../../../../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const id = idParam(c), draftId = c.req.param('draftId') ?? notFound();
  c.header('Cache-Control', 'private, no-store');
  const loaded = await draftFor(actor, id, draftId);
  const { snapshot } = loaded;
  return {
    ...loaded, capabilities: [...loaded.capabilities],
    snapshot: { ...snapshot, recipients: {
      to: [...snapshot.recipients.to], cc: [...snapshot.recipients.cc], bcc: [...snapshot.recipients.bcc],
    }, attachments: snapshot.attachments.map((a) => ({ ...a })) },
    reviews: await draftHistory(actor, id, draftId),
  };
});
export const PATCH = defineHandler.withValidator({ body: editDraftInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_drafts', 60, 3600);
  return editDraft(actor, idParam(c), c.req.param('draftId') ?? notFound(), body);
});
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_drafts', 60, 3600);
  return cancelDraft(actor, idParam(c), c.req.param('draftId') ?? notFound());
});
