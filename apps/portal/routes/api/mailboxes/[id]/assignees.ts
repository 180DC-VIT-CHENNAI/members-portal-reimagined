import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { assignees } from '../../../../src/server/mailboxes/inbox-read';
export const GET = defineHandler(async (c) => {
  c.header('Cache-Control', 'private, no-store');
  return { people: await assignees(await requirePrincipal(c), idParam(c)) };
});
