import { newsletterAssets, newsletterSubscribers } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../src/server/audit';
import { enqueueEmailCampaign } from '../../../src/server/email/queue';
import { sender } from '../../../src/server/email/sender';
import { requirePrincipal } from '../../../src/server/guard';
import { badRequest, forbidden } from '../../../src/server/http';
import { escapeHtml } from '../../../src/server/html';
import { assetUrl, requireAsset, sourceAttachment } from '../../../src/server/newsletter/issues';
import { newsletterFrame, UNSUBSCRIBE_MARKER } from '../../../src/server/newsletter/mail';
import { subscriptionOrigin } from '../../../src/server/newsletter/subscriptions';
import { can } from '../../../src/server/permissions';
import { rateLimit } from '../../../src/server/rate-limit';
import { optionalText, singleLine } from '../../../src/server/validation';

/** Explicit mode is mandatory: malformed test input must never fall through to broadcasting. */
export const POST = defineHandler.withValidator({ body: v.object({ mode: v.picklist(['test', 'broadcast']), subject: singleLine(255), description: singleLine(4000), sourceAssetId: optionalText(64), imageAssetId: optionalText(64) }) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  if (!can(actor.permissions, body.mode === 'test' ? 'newsletter.edit' : 'newsletter.send', null)) forbidden();
  await rateLimit(c, body.mode === 'test' ? 'newsletter_test' : 'newsletter_event', body.mode === 'test' ? 10 : 3, 3600);
  const origin = subscriptionOrigin(c);
  await requireAsset(actor, body.sourceAssetId, 'source'); await requireAsset(actor, body.imageAssetId, 'image');
  const asset = async (id: string | null | undefined) => id ? (await db.select().from(newsletterAssets).where(eq(newsletterAssets.id, id)))[0] ?? null : null;
  const source = await asset(body.sourceAssetId), image = await asset(body.imageAssetId);
  const recipients = body.mode === 'test' ? [actor.person.email] : (await db.select({ email: newsletterSubscribers.email }).from(newsletterSubscribers).where(eq(newsletterSubscribers.status, 'active'))).map((s) => s.email);
  if (!recipients.length) badRequest('no_active_subscribers');
  const content = `<p>${escapeHtml(body.description).replace(/\n/g,'<br>')}</p>${image ? `<p><img style="max-width:100%" alt="Event poster" src="${origin}${assetUrl(image.key)}"></p>` : ''}${source ? `<p><a href="${origin}${assetUrl(source.key)}">Download ${escapeHtml(source.filename)}</a></p>` : ''}`;
  const html = newsletterFrame(body.subject, content, body.mode === 'broadcast' ? UNSUBSCRIBE_MARKER : `${origin}/unsubscribe`);
  const campaignId = await enqueueEmailCampaign({ kind: 'event', fromAddress: sender('180DC Events'), subject: (body.mode === 'test' ? '[Test] ' : '') + body.subject, html,
    recipients, attachments: sourceAttachment(source), createdBy: actor.person.id, meta: { origin, replyTo: actor.person.email, audience: body.mode === 'broadcast' ? 'subscribers' : 'test' } });
  await audit(actor.person.id, 'newsletter.event.' + body.mode, 'email_campaign', campaignId);
  return { campaignId, queued: recipients.length };
});
