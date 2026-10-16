import { caseStudies } from '@schema';
import { defineHandler } from 'void';
import { asc, db } from 'void/db';
import { rateLimit } from '../../../src/server/rate-limit';

/** Public: published case studies, oldest first. The author's person id is not exposed. */
export const GET = defineHandler(async (c) => {
  await rateLimit(c, 'content_case_studies', 100, 60);
  return db
    .select({
      id: caseStudies.id,
      tag: caseStudies.tag,
      title: caseStudies.title,
      description: caseStudies.description,
      content: caseStudies.content,
      imageUrl: caseStudies.imageUrl,
      sourceFileUrl: caseStudies.sourceFileUrl,
      authorName: caseStudies.authorName,
      createdAt: caseStudies.createdAt,
    })
    .from(caseStudies)
    .orderBy(asc(caseStudies.createdAt), asc(caseStudies.id));
});
