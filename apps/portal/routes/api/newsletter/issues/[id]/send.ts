import { defineHandler } from 'void';
import { audit } from '../../../../../src/server/audit';
import { requirePermission } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { broadcastIssue, issueFor } from '../../../../../src/server/newsletter/issues';
import { subscriptionOrigin } from '../../../../../src/server/newsletter/subscriptions';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const POST = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'newsletter.send', null);
  const issue = await issueFor(actor, idParam(c));
  await rateLimit(c, 'newsletter_broadcast', 3, 3600);
  const result = await broadcastIssue(actor, subscriptionOrigin(c), issue);
  await audit(actor.person.id, 'newsletter.send', 'newsletter', issue.id, result);
  return result;
});
