import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { listConversations } from '../../../../src/server/messaging/access';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Conversations the caller can read, with unread counts, newest activity first. */
export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'messages_read', 240, 60);
  c.header('Cache-Control', 'private, no-store');
  return { conversations: await listConversations(principal) };
});
