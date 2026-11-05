import { defineHandler } from 'void';
import { projectSummary, noStore } from '../../../../../src/server/github/sync/reads';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { projectFor } from '../../../../../src/server/projects';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'github_read', 120, 60);
  const loaded = await projectFor(principal, idParam(c));
  noStore(c);
  return projectSummary(principal, loaded);
});
