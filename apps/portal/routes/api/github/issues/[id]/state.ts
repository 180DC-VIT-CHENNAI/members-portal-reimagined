import { defineHandler } from 'void';
import { loadIssueFor, requireIssueWrite } from '../../../../../src/server/github/sync/access';
import { setStateInput } from '../../../../../src/server/github/sync/inputs';
import { setState } from '../../../../../src/server/github/sync/writes';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const PUT = defineHandler.withValidator({ body: setStateInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  const loaded = await loadIssueFor(principal, idParam(c));
  requireIssueWrite(principal, loaded.project);
  await rateLimit(c, 'github_issue_write', 300, 3600);
  return setState(principal, loaded, body);
});
