import { defineHandler } from 'void';
import { audit } from '../../../../src/server/audit';
import { startLink, unlinkAccount } from '../../../../src/server/github/sync/accounts';
import { requirePrincipal } from '../../../../src/server/guard';
import { rateLimit } from '../../../../src/server/rate-limit';

export const POST = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'github_link', 20, 3600);
  return { url: await startLink(principal, new URL(c.req.url).origin) };
});

export const DELETE = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'github_link', 20, 3600);
  const removed = await unlinkAccount(principal.person.id);
  if (removed) await audit(principal.person.id, 'github.account.self_unlink', 'github_account', principal.person.id, { githubUserId: removed.githubUserId, login: removed.login });
  return c.body(null, 204);
});
