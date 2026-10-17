import { projects } from '@schema';
import { defineHandler } from 'void';
import { db, desc, eq } from 'void/db';
import { rateLimit } from '../../../src/server/rate-limit';

/** Public: completed client projects for the landing page, most recently completed first. */
export const GET = defineHandler(async (c) => {
  await rateLimit(c, 'content_projects', 100, 60);
  return db
    .select({ id: projects.id, name: projects.name, client: projects.client, description: projects.description, completedAt: projects.completedAt })
    .from(projects)
    .where(eq(projects.status, 'completed'))
    .orderBy(desc(projects.completedAt), desc(projects.id));
});
