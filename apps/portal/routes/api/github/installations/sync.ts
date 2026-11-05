import { defineHandler } from 'void';
import { requireGitHubManage } from '../../../../src/server/github/sync/access';
import { syncInstallationsNow } from '../../../../src/server/github/sync/admin';
import { rateLimit } from '../../../../src/server/rate-limit';

export const POST = defineHandler(async (c) => {
  const actor = await requireGitHubManage(c);
  await rateLimit(c, 'github_installations_sync', 10, 3600);
  return syncInstallationsNow(actor);
});
