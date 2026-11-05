import { defineHandler } from 'void';
import { requireGitHubManage } from '../../../../src/server/github/sync/access';
import { accountsOverview } from '../../../../src/server/github/sync/accounts';
import { noStore } from '../../../../src/server/github/sync/reads';
import { rateLimit } from '../../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  await requireGitHubManage(c);
  await rateLimit(c, 'github_admin_read', 120, 60);
  noStore(c);
  return accountsOverview();
});
