import { defineHandler } from 'void';
import { requirePrincipal } from '../../../src/server/guard';
import { rateLimit } from '../../../src/server/rate-limit';
import { createTemplate, listTemplates } from '../../../src/server/templates/studio';
import { createTemplateInput, templateQuery } from '../../../src/server/templates/validation';

export const GET = defineHandler.withValidator({ query: templateQuery })(async (c, { query }) => {
  const actor = await requirePrincipal(c);
  c.header('Cache-Control', 'private, no-store');
  return listTemplates(actor, query);
});
export const POST = defineHandler.withValidator({ body: createTemplateInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'templates_write', 60, 3600);
  return c.json(await createTemplate(actor, body), 201);
});
