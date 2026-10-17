import { newsletters } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq, isNotNull, or } from 'void/db';
import { idParam, notFound } from '../../../src/server/http';
import { sanitizeHtml } from '../../../src/server/html';
import { assetUrl, issueAssets, slugOf } from '../../../src/server/newsletter/issues';
import { rateLimit } from '../../../src/server/rate-limit';

/** No public draft access, including lookup by a known UUID. */
export const GET = defineHandler(async (c) => {
  await rateLimit(c, 'newsletter_public', 100, 60);
  const value = idParam(c);
  const number = /^issue-(\d+)$/.exec(value)?.[1];
  const [issue] = await db.select().from(newsletters).where(and(isNotNull(newsletters.sentAt), or(eq(newsletters.id, value), number ? eq(newsletters.issue, Number(number)) : undefined)));
  if (!issue) notFound('newsletter_not_found');
  const assets = await issueAssets(issue);
  return { id: issue.id, slug: slugOf(issue.issue), title: issue.title, description: issue.description, content: sanitizeHtml(issue.content), sentAt: issue.sentAt,
    sourceUrl: assets.source ? assetUrl(assets.source.key) : null, imageUrl: assets.image ? assetUrl(assets.image.key) : null };
});
