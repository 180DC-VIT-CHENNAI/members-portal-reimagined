import { defineHandler } from 'void';
import { requirePrincipal } from '../../src/server/guard';
import { preferencesFor, preferencesInput, savePreferences } from '../../src/server/messaging/preferences';
import { rateLimit } from '../../src/server/rate-limit';

/** The caller's notification preferences per category, with defaults filled in. */
export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'notifications_read', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  return preferencesFor(principal);
});

/** Save preferences; email digests are stored as an opt-in but nothing sends them yet. */
export const PUT = defineHandler.withValidator({ body: preferencesInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'notifications_write', 120, 60);
  return savePreferences(principal, body);
});
