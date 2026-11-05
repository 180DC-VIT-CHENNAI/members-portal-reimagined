import { defineHandler } from 'void';
import { loadIssueFor, requireIssueWrite } from '../../../../../src/server/github/sync/access';
import { setAssigneesInput } from '../../../../../src/server/github/sync/inputs';
import { setAssignees } from '../../../../../src/server/github/sync/writes';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const PUT = defineHandler.withValidator({ body: setAssigneesInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  const loaded = await loadIssueFor(principal, idParam(c));
  requireIssueWrite(principal, loaded.project);
  await rateLimit(c, 'github_issue_write', 300, 3600);
  return setAssignees(principal, loaded, body);
});
