import { caseStudies } from '@schema';
import { defineHandler } from 'void';
import { db, desc } from 'void/db';
import { audit } from '../../../src/server/audit';
import { caseStudyBody } from '../../../src/server/content';
import { requirePermission } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';
import { sanitizeHtml, stripTags } from '../../../src/server/html';
import { rateLimit } from '../../../src/server/rate-limit';

/** Every case study for editors, newest first. */
export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'content.publish');
  return db.select().from(caseStudies).orderBy(desc(caseStudies.createdAt), desc(caseStudies.id));
});

/** Publish a case study (no approval step, as before). */
export const POST = defineHandler.withValidator({ body: caseStudyBody })(async (c, { body }) => {
  const actor = await requirePermission(c, 'content.publish');
  await rateLimit(c, 'case_study_create', 20, 3600);
  const content = sanitizeHtml(body.content);
  if (stripTags(content).length < 10) badRequest('content_too_short');
  const id = crypto.randomUUID().replace(/-/g, '');
  const title = body.title || 'Untitled';
  await db.insert(caseStudies).values({
    id,
    tag: body.tag || 'Uncategorized',
    title,
    description: body.description ?? '',
    content,
    imageUrl: body.imageUrl ?? null,
    sourceFileUrl: body.sourceFileUrl ?? null,
    authorName: actor.person.fullName,
    createdBy: actor.person.id,
  });
  await audit(actor.person.id, 'case_study.create', 'case_study', id, { title });
  return c.json({ id }, 201);
});
