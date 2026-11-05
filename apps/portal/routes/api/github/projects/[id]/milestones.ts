import { defineHandler } from 'void';
import { milestonesQuery } from '../../../../../src/server/github/sync/inputs';
import { milestonesFor, noStore } from '../../../../../src/server/github/sync/reads';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { projectFor } from '../../../../../src/server/projects';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const GET = defineHandler.withValidator({ query: milestonesQuery })(async (c, { query }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'github_read', 120, 60);
  const loaded = await projectFor(principal, idParam(c));
  noStore(c);
  return milestonesFor(loaded, query);
});
