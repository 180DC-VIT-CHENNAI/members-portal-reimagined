import { defineHandler } from 'void';
import { requireGitHubManage } from '../../../src/server/github/sync/access';
import { statusFor } from '../../../src/server/github/sync/installations';
import { noStore } from '../../../src/server/github/sync/reads';
import { rateLimit } from '../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  await requireGitHubManage(c);
  await rateLimit(c, 'github_admin_read', 120, 60);
  noStore(c);
  return statusFor();
});
