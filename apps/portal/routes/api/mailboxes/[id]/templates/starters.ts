import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { starterList } from '../../../../../src/server/templates/studio';

export const GET = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  return { starters: await starterList(actor, idParam(c)) };
});
