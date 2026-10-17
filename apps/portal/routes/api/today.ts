import { defineHandler } from 'void';
import { requirePrincipal } from '../../src/server/guard';
import { rateLimit } from '../../src/server/rate-limit';
import { todayFor } from '../../src/server/today';

/** The signed-in person's home page: open tasks, this week's meets, the latest announcements and what needs their attention. */
export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'today', 60, 60);
  c.header('Cache-Control', 'private, no-store');
  return todayFor(principal);
});
