import { announcements, people } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, desc, eq } from 'void/db';
import { audit } from '../../../src/server/audit';
import { requirePermission, requirePrincipal } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';
import { stripTags } from '../../../src/server/html';
import { rateLimit } from '../../../src/server/rate-limit';

/** Announcements for signed-in members, newest first. */
export const GET = defineHandler(async (c) => {
  await requirePrincipal(c);
  return db
    .select({
      id: announcements.id,
      title: announcements.title,
      content: announcements.content,
      createdAt: announcements.createdAt,
      authorName: people.fullName,
    })
    .from(announcements)
    .leftJoin(people, eq(announcements.createdBy, people.id))
    .orderBy(desc(announcements.createdAt), desc(announcements.id));
});

/** Post a plain-text announcement (tags are stripped). */
export const POST = defineHandler.withValidator({
  body: v.object({
    title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
    content: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
  }),
})(async (c, { body }) => {
  const actor = await requirePermission(c, 'announcements.manage');
  await rateLimit(c, 'create_announcement', 5, 3600);
  const title = stripTags(body.title);
  const content = stripTags(body.content);
  if (!title || !content) badRequest('missing_title_or_content');
  const id = crypto.randomUUID();
  await db.insert(announcements).values({ id, title, content, createdBy: actor.person.id });
  await audit(actor.person.id, 'announcement.create', 'announcement', id, { title });
  return c.json({ id }, 201);
});
