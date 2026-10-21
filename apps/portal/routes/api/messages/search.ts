import { defineHandler } from 'void';
import { requirePrincipal } from '../../../src/server/guard';
import { searchMessages, searchQuery } from '../../../src/server/messaging/messages';
import { rateLimit } from '../../../src/server/rate-limit';

/** Search live messages in conversations the caller can read now. */
export const GET = defineHandler.withValidator({ query: searchQuery })(async (c, { query }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'messages_search', 30, 60);
  c.header('Cache-Control', 'private, no-store');
  return searchMessages(principal, query);
});
