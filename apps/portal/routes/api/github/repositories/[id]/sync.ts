import { defineHandler } from 'void';
import { repositoryIdParam, requireGitHubManage } from '../../../../../src/server/github/sync/access';
import { syncRepositoryNow } from '../../../../../src/server/github/sync/admin';
import { syncRepositoryInput } from '../../../../../src/server/github/sync/inputs';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const POST = defineHandler.withValidator({ body: syncRepositoryInput })(async (c, { body }) => {
  const actor = await requireGitHubManage(c);
  await rateLimit(c, 'github_repo_sync', 30, 3600);
  return syncRepositoryNow(actor, repositoryIdParam(c), body.full === true);
});
