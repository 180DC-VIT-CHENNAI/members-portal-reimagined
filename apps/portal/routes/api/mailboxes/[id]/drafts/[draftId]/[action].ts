import * as v from 'valibot';
import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { badRequest, idParam, notFound } from '../../../../../../src/server/http';
import { sendIntent } from '../../../../../../src/server/mailboxes/intents';
import { reviewDraft, submitDraft } from '../../../../../../src/server/mailboxes/reviews';
import { reviewInput, revisionInput, sendInput } from '../../../../../../src/server/mailboxes/validation';
import { rateLimit } from '../../../../../../src/server/rate-limit';

function parse<T extends v.GenericSchema>(schema: T, body: unknown): v.InferOutput<T> {
  const parsed = v.safeParse(schema, body);
  if (!parsed.success) badRequest('invalid_mail_action');
  return parsed.output;
}

export const POST = defineHandler.withValidator({ body: v.unknown() })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_actions', 100, 3600);
  const mailboxId = idParam(c), draftId = c.req.param('draftId') ?? notFound();
  const action = c.req.param('action');
  switch (action) {
    case 'submit': return submitDraft(actor, mailboxId, draftId, parse(revisionInput, body).revision);
    case 'review': return reviewDraft(actor, mailboxId, draftId, parse(reviewInput, body));
    case 'send':
    case 'schedule': return sendIntent(actor, mailboxId, draftId, parse(sendInput, body));
    default: return notFound();
  }
});
