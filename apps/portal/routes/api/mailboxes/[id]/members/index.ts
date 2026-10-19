import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { members } from '../../../../../src/server/mailboxes/management';

export const GET = defineHandler(async (c) => {
  c.header('Cache-Control', 'private, no-store');
  return { members: await members(await requirePrincipal(c), idParam(c)) };
});
