import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { conversationFor, mentionCandidates } from '../../../../../src/server/messaging/access';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** Current members who can read this conversation (the mention picker). */
export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  const conversation = await conversationFor(principal, idParam(c));
  await rateLimit(c, 'messages_read', 240, 60);
  c.header('Cache-Control', 'private, no-store');
  return { people: await mentionCandidates(conversation) };
});
