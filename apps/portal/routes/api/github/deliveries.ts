import { defineHandler } from 'void';
import { requireGitHubManage } from '../../../src/server/github/sync/access';
import { deliveriesFor } from '../../../src/server/github/sync/admin';
import { deliveriesQuery } from '../../../src/server/github/sync/inputs';
import { noStore } from '../../../src/server/github/sync/reads';
import { rateLimit } from '../../../src/server/rate-limit';

export const GET = defineHandler.withValidator({ query: deliveriesQuery })(async (c, { query }) => {
  await requireGitHubManage(c);
  await rateLimit(c, 'github_admin_read', 120, 60);
  noStore(c);
  return deliveriesFor(query);
});
