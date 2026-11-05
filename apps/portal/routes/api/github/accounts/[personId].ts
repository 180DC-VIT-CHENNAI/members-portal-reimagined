import { defineHandler } from 'void';
import { audit } from '../../../../src/server/audit';
import { routeParam } from '../../../../src/server/departments';
import { requireGitHubManage } from '../../../../src/server/github/sync/access';
import { adminLink, unlinkAccount } from '../../../../src/server/github/sync/accounts';
import { linkAccountInput } from '../../../../src/server/github/sync/inputs';
import { rateLimit } from '../../../../src/server/rate-limit';

export const PUT = defineHandler.withValidator({ body: linkAccountInput })(async (c, { body }) => {
  const actor = await requireGitHubManage(c);
  await rateLimit(c, 'github_account_admin', 60, 3600);
  return { link: await adminLink(actor, routeParam(c, 'personId'), body.login) };
});

export const DELETE = defineHandler(async (c) => {
  const actor = await requireGitHubManage(c);
  await rateLimit(c, 'github_account_admin', 60, 3600);
  const personId = routeParam(c, 'personId');
  const removed = await unlinkAccount(personId);
  if (removed) await audit(actor.person.id, 'github.account.unlink', 'github_account', personId, { githubUserId: removed.githubUserId, login: removed.login });
  return c.body(null, 204);
});
