import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { conversationFor } from '../../../../../src/server/messaging/access';
import { muteInput, setMuted } from '../../../../../src/server/messaging/messages';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** Mute or unmute: a muted conversation leaves the unread badge and sends no mention notices. */
export const PUT = defineHandler.withValidator({ body: muteInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  const conversation = await conversationFor(principal, idParam(c));
  await rateLimit(c, 'messages_write', 60, 60);
  await setMuted(principal, conversation, body.muted);
  return { muted: body.muted };
});
