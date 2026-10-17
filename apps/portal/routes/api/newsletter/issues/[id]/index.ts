import { newsletters } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq, isNull, sql } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { requirePermission } from '../../../../../src/server/guard';
import { conflict, forbidden, idParam } from '../../../../../src/server/http';
import { articleHtml, issueFor, issuePatch, issueRights, issueView, requireAsset } from '../../../../../src/server/newsletter/issues';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'newsletter.edit', null);
  c.header('Cache-Control', 'private, no-store');
  return issueView(actor, idParam(c));
});
export const PATCH = defineHandler.withValidator({ body: issuePatch })(async (c, { body }) => {
  const actor = await requirePermission(c, 'newsletter.edit', null);
  const issue = await issueFor(actor, idParam(c));
  await rateLimit(c, 'newsletter_write', 120, 3600);
  await requireAsset(actor, body.sourceAssetId, 'source', issue.sourceAssetId);
  await requireAsset(actor, body.imageAssetId, 'image', issue.imageAssetId);
  const [changed] = await db.update(newsletters).set({ title: body.title, emailSubject: body.emailSubject || body.title,
    description: body.description || null, content: articleHtml(body.content, body.format), shared: body.shared,
    sourceAssetId: body.sourceAssetId || null, imageAssetId: body.imageAssetId || null, version: sql`${newsletters.version} + 1`, updatedAt: sql`datetime('now')`,
  }).where(and(eq(newsletters.id, issue.id), eq(newsletters.version, body.version), isNull(newsletters.broadcastId))).returning({ version: newsletters.version });
  if (!changed) conflict(issue.broadcastId ? 'newsletter_already_sending_or_sent' : 'newsletter_changed');
  await audit(actor.person.id, 'newsletter.update', 'newsletter', issue.id);
  return changed;
});
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'newsletter.edit', null);
  const issue = await issueFor(actor, idParam(c));
  if (!issueRights(actor, issue).remove) forbidden();
  await rateLimit(c, 'newsletter_write', 120, 3600);
  const [removed] = await db.delete(newsletters).where(and(eq(newsletters.id, issue.id), isNull(newsletters.broadcastId))).returning({ id: newsletters.id });
  if (!removed) conflict('newsletter_already_sending_or_sent');
  await audit(actor.person.id, 'newsletter.delete', 'newsletter', issue.id);
  return { removed: true };
});
