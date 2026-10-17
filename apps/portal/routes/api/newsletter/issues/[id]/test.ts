import { defineHandler } from 'void';
import { audit } from '../../../../../src/server/audit';
import { enqueueEmailCampaign } from '../../../../../src/server/email/queue';
import { sender } from '../../../../../src/server/email/sender';
import { requirePermission } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { issueAssets, issueFor, issueMail, sourceAttachment } from '../../../../../src/server/newsletter/issues';
import { UNSUBSCRIBE_MARKER } from '../../../../../src/server/newsletter/mail';
import { subscriptionOrigin } from '../../../../../src/server/newsletter/subscriptions';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** A test can only reach the signed-in person's verified email; it can never become a broadcast. */
export const POST = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'newsletter.edit', null);
  const issue = await issueFor(actor, idParam(c));
  await rateLimit(c, 'newsletter_test', 10, 3600);
  const origin = subscriptionOrigin(c);
  const assets = await issueAssets(issue);
  const campaignId = await enqueueEmailCampaign({ kind: 'newsletter_test', fromAddress: sender('180DC Newsletter'), subject: `[Test] ${issue.emailSubject}`,
    html: issueMail(origin, issue, assets).split(UNSUBSCRIBE_MARKER).join(`${origin}/unsubscribe`), recipients: [actor.person.email],
    attachments: sourceAttachment(assets.source), createdBy: actor.person.id, meta: { replyTo: actor.person.email, headers: { 'List-Unsubscribe': `<${origin}/unsubscribe>` } },
  });
  await audit(actor.person.id, 'newsletter.test', 'newsletter', issue.id, { campaignId });
  return { campaignId, queued: 1 };
});
