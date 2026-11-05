import { defineHandler } from 'void';
import { pullsQuery } from '../../../../../src/server/github/sync/inputs';
import { pullsFor, noStore } from '../../../../../src/server/github/sync/reads';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { projectFor } from '../../../../../src/server/projects';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const GET = defineHandler.withValidator({ query: pullsQuery })(async (c, { query }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'github_read', 120, 60);
  const loaded = await projectFor(principal, idParam(c));
  noStore(c);
  return pullsFor(principal, loaded, query);
});
