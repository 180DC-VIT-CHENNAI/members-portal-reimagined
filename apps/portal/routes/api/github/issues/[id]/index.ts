import { defineHandler } from 'void';
import { loadIssueFor, requireIssueWrite } from '../../../../../src/server/github/sync/access';
import { updateIssueInput } from '../../../../../src/server/github/sync/inputs';
import { issueDetail, noStore } from '../../../../../src/server/github/sync/reads';
import { updateIssue } from '../../../../../src/server/github/sync/writes';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'github_detail', 60, 60);
  const loaded = await loadIssueFor(principal, idParam(c));
  noStore(c);
  return issueDetail(principal, loaded);
});

export const PATCH = defineHandler.withValidator({ body: updateIssueInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  const loaded = await loadIssueFor(principal, idParam(c));
  requireIssueWrite(principal, loaded.project);
  await rateLimit(c, 'github_issue_write', 300, 3600);
  return updateIssue(principal, loaded, body);
});
