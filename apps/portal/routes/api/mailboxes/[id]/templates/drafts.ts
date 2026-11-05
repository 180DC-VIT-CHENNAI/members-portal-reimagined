import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { templateDraft } from '../../../../../src/server/templates/studio';
import { renderInput } from '../../../../../src/server/templates/validation';

export const POST = defineHandler.withValidator({ body: renderInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_drafts', 60, 3600);
  return c.json(await templateDraft(actor, idParam(c), body), 201);
});
