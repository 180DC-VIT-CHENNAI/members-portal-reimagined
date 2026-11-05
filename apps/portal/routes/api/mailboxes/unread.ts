import { defineHandler } from 'void';
import { requirePrincipal } from '../../../src/server/guard';
import { unreadMailTotal } from '../../../src/server/mailboxes/inbox-read';

export const GET = defineHandler(async (c) => {
  c.header('Cache-Control', 'private, no-store');
  return unreadMailTotal(await requirePrincipal(c));
});
