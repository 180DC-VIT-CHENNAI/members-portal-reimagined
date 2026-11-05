import { defineHandler } from 'void';
import { markNoticesReadInput } from '../../../../src/server/github/sync/inputs';
import { markNoticesRead } from '../../../../src/server/github/sync/notices';
import { noStore } from '../../../../src/server/github/sync/reads';
import { requirePrincipal } from '../../../../src/server/guard';
import { rateLimit } from '../../../../src/server/rate-limit';

export const POST = defineHandler.withValidator({ body: markNoticesReadInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'github_notices_write', 120, 60);
  noStore(c);
  return { unread: await markNoticesRead(principal, body) };
});
