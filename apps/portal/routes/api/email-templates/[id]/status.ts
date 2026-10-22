import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { rateLimit } from '../../../../src/server/rate-limit';
import { transition } from '../../../../src/server/templates/studio';
import { transitionInput } from '../../../../src/server/templates/validation';

export const POST = defineHandler.withValidator({ body: transitionInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'templates_write', 60, 3600);
  return transition(actor, idParam(c), body.version, body.action);
});
