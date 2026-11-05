import { defineHandler } from 'void';
import { repositoryIdParam, requireGitHubManage } from '../../../../../src/server/github/sync/access';
import { mapRepository } from '../../../../../src/server/github/sync/admin';
import { mapRepositoryInput } from '../../../../../src/server/github/sync/inputs';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const PUT = defineHandler.withValidator({ body: mapRepositoryInput })(async (c, { body }) => {
  const actor = await requireGitHubManage(c);
  await rateLimit(c, 'github_repo_map', 60, 3600);
  return mapRepository(actor, repositoryIdParam(c), body.projectId);
});
