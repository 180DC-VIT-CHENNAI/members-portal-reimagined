import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { preview } from '../../../../../src/server/templates/studio';
import { renderInput } from '../../../../../src/server/templates/validation';

export const POST = defineHandler.withValidator({ body: renderInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'templates_preview', 300, 3600);
  c.header('Cache-Control', 'private, no-store');
  return preview(actor, idParam(c), body);
});
