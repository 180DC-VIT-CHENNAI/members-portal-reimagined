import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { templateDetail } from '../../../../src/server/templates/studio';

export const GET = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  c.header('Cache-Control', 'private, no-store');
  return templateDetail(actor, idParam(c));
});
