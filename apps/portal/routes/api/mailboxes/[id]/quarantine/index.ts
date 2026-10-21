import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { listQuarantine } from '../../../../../src/server/mailboxes/quarantine';

export const GET = defineHandler(async (c) => {
  c.header('Cache-Control', 'private, no-store');
  return { messages: await listQuarantine(await requirePrincipal(c), idParam(c)) };
});
