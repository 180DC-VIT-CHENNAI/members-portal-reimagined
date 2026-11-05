import { defineHandler } from 'void';
import { myWork, noStore } from '../../../src/server/github/sync/reads';
import { requirePrincipal } from '../../../src/server/guard';
import { rateLimit } from '../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'github_read', 120, 60);
  noStore(c);
  return myWork(principal);
});
