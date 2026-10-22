import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { rateLimit } from '../../../../src/server/rate-limit';
import { saveVersion } from '../../../../src/server/templates/studio';
import { saveVersionInput } from '../../../../src/server/templates/validation';

export const POST = defineHandler.withValidator({ body: saveVersionInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'templates_write', 60, 3600);
  return c.json(await saveVersion(actor, idParam(c), body), 201);
});
