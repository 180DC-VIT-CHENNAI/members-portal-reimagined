import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { testSend } from '../../../../../src/server/templates/studio';
import { testInput } from '../../../../../src/server/templates/validation';

export const POST = defineHandler.withValidator({ body: testInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'templates_test', 10, 3600);
  return testSend(actor, idParam(c), body);
});
