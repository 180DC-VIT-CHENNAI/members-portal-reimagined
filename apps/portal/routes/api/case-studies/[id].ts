import { caseStudies } from '@schema';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../src/server/audit';
import { caseStudyBody } from '../../../src/server/content';
import { requirePermission } from '../../../src/server/guard';
import { badRequest, idParam, notFound } from '../../../src/server/http';
import { sanitizeHtml, stripTags } from '../../../src/server/html';
import { rateLimit } from '../../../src/server/rate-limit';

/** Replace a case study's text and links. */
export const PUT = defineHandler.withValidator({ body: caseStudyBody })(async (c, { body }) => {
  const actor = await requirePermission(c, 'content.publish');
  await rateLimit(c, 'case_study_edit', 20, 3600);
  const id = idParam(c);
  const [existing] = await db.select({ id: caseStudies.id }).from(caseStudies).where(eq(caseStudies.id, id));
  if (!existing) notFound('case_study_not_found');
  const content = sanitizeHtml(body.content);
  if (stripTags(content).length < 10) badRequest('content_too_short');
  const [updated] = await db
    .update(caseStudies)
    .set({
      tag: body.tag || 'Uncategorized',
      title: body.title || 'Untitled',
      description: body.description ?? '',
      content,
      imageUrl: body.imageUrl ?? null,
      sourceFileUrl: body.sourceFileUrl ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(caseStudies.id, id))
    .returning();
  await audit(actor.person.id, 'case_study.update', 'case_study', id, { title: updated.title });
  return updated;
});

export const DELETE = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'content.manage');
  const id = idParam(c);
  const [row] = await db.select({ title: caseStudies.title }).from(caseStudies).where(eq(caseStudies.id, id));
  if (!row) notFound('case_study_not_found');
  await db.delete(caseStudies).where(eq(caseStudies.id, id));
  await audit(actor.person.id, 'case_study.delete', 'case_study', id, { title: row.title });
  return null;
});
