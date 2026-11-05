import { defineHandler } from 'void';
import { requireIssueWrite } from '../../../../../src/server/github/sync/access';
import { createIssueInput } from '../../../../../src/server/github/sync/inputs';
import { createIssue } from '../../../../../src/server/github/sync/writes';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { projectFor } from '../../../../../src/server/projects';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const POST = defineHandler.withValidator({ body: createIssueInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  const project = await projectFor(principal, idParam(c));
  requireIssueWrite(principal, project);
  await rateLimit(c, 'github_issue_write', 300, 3600);
  const result = await createIssue(principal, project, body);
  return c.json(result, result.replayed ? 200 : 201);
});
