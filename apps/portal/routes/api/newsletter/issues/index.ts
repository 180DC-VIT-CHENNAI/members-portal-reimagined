import { newsletters } from '@schema';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePermission } from '../../../../src/server/guard';
import { articleHtml, editorIssues, issueInput, requireAsset } from '../../../../src/server/newsletter/issues';
import { rateLimit } from '../../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'newsletter.edit', null);
  c.header('Cache-Control', 'private, no-store');
  return editorIssues(actor);
});
export const POST = defineHandler.withValidator({ body: issueInput })(async (c, { body }) => {
  const actor = await requirePermission(c, 'newsletter.edit', null);
  await rateLimit(c, 'newsletter_write', 120, 3600);
  await requireAsset(actor, body.sourceAssetId, 'source');
  await requireAsset(actor, body.imageAssetId, 'image');
  const id = crypto.randomUUID();
  await db.insert(newsletters).values({ id, title: body.title, emailSubject: body.emailSubject || body.title,
    description: body.description || null, content: articleHtml(body.content, body.format), shared: body.shared,
    sourceAssetId: body.sourceAssetId || null, imageAssetId: body.imageAssetId || null, createdBy: actor.person.id });
  await audit(actor.person.id, 'newsletter.create', 'newsletter', id);
  return c.json({ id }, 201);
});
