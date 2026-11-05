import { defineHandler } from 'void';
import { noticesQuery } from '../../../../src/server/github/sync/inputs';
import { noticesFor } from '../../../../src/server/github/sync/notices';
import { noStore } from '../../../../src/server/github/sync/reads';
import { requirePrincipal } from '../../../../src/server/guard';
import { rateLimit } from '../../../../src/server/rate-limit';

export const GET = defineHandler.withValidator({ query: noticesQuery })(async (c, { query }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'github_read', 120, 60);
  noStore(c);
  return noticesFor(principal, query);
});
