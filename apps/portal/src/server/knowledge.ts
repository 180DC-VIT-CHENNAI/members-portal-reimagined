import { knowledgeArticles as articles, knowledgeRevisions, projectTasks } from '@schema';
import type { SQL } from 'drizzle-orm';
import type { Context } from 'hono';
import * as v from 'valibot';
import { and, db, desc, eq, inArray, like, or, sql } from 'void/db';
import { audit } from './audit';
import { departmentOr404 } from './departments';
import { requirePrincipal } from './guard';
import { conflict, forbidden, idParam, notFound } from './http';
import { renderKnowledgeMarkdown } from './knowledge-markdown';
import { listMeets } from './meets';
import { can, type Permission } from './permissions';
import type { Principal } from './principal';
import { projectFor } from './projects';
import { rateLimit } from './rate-limit';
import { id, singleLine } from './validation';

export const articleInput = v.object({
  title: singleLine(200),
  slug: v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), v.maxLength(160)),
  body: v.pipe(v.string(), v.minLength(1), v.maxLength(100000)),
  scope: v.picklist(['global', 'department']),
  departmentId: v.optional(v.nullable(id), null),
  status: v.picklist(['draft', 'published', 'archived']),
  tags: v.optional(v.pipe(v.array(singleLine(40)), v.maxLength(20)), []),
  projectId: v.optional(v.nullable(id), null),
  taskId: v.optional(v.nullable(id), null),
  meetId: v.optional(v.nullable(id), null),
  revision: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});
export const articleQuery = v.object({
  search: v.optional(v.pipe(v.string(), v.maxLength(200)), ''),
  before: v.optional(id),
});
type Article = typeof articles.$inferSelect;

/** Both the feature grant and departmental boundary are SQL predicates before search/pagination. */
function permissionWhere(principal: Principal, permission: Permission): SQL {
  const grant = principal.permissions.get(permission);
  if (!grant) return sql`0`;
  const grantWhere = grant === 'global' ? sql`1` : inArray(articles.departmentId, [...grant]);
  const workspace = principal.permissions.get('departments.workspace.view');
  const departments = new Set(workspace === 'global' ? [] : workspace ?? []);
  if (principal.person.departmentId) departments.add(principal.person.departmentId);
  const boundary = workspace === 'global' ? sql`1` : or(eq(articles.scope, 'global'),
    departments.size ? inArray(articles.departmentId, [...departments]) : sql`0`);
  return and(grantWhere, boundary) ?? sql`0`;
}
const readable = (principal: Principal) => and(permissionWhere(principal, 'knowledge.view'),
  or(eq(articles.status, 'published'), permissionWhere(principal, 'knowledge.edit')));

export async function articleFor(principal: Principal, articleId: string) {
  const [article] = await db.select().from(articles).where(and(eq(articles.id, articleId), readable(principal)));
  return article ?? notFound('article_not_found');
}

function editor(principal: Principal, article: Pick<Article, 'departmentId'>, permission: Permission) {
  if (!can(principal.permissions, permission, article.departmentId)) forbidden();
}

export async function listArticles(c: Context, query: v.InferOutput<typeof articleQuery>) {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'knowledge_search', 60, 60);
  c.header('Cache-Control', 'private, no-store');
  const search = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await db.select({
    id: articles.id, title: articles.title, slug: articles.slug, status: articles.status,
    scope: articles.scope, departmentId: articles.departmentId, ownerId: articles.ownerId, tags: articles.tags, updatedAt: articles.updatedAt,
  }).from(articles).where(and(readable(principal),
    query.before ? sql`${articles.id} < ${query.before}` : undefined,
    query.search ? or(sql`${articles.title} LIKE ${search} ESCAPE '\\'`, sql`${articles.body} LIKE ${search} ESCAPE '\\'`) : undefined))
    .orderBy(desc(articles.id)).limit(51);
  return { articles: rows.slice(0, 50), nextBefore: rows.length > 50 ? rows[49].id : null };
}

/** Linked IDs are never authority: verify access on write and remove hidden links on every read. */
async function readableLinks(principal: Principal, input: Pick<Article, 'projectId' | 'taskId' | 'meetId'>) {
  const result = { projectId: input.projectId, taskId: input.taskId, meetId: input.meetId };
  try {
    if (result.projectId) await projectFor(principal, result.projectId);
    if (result.taskId) {
      const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, result.taskId));
      if (!task) notFound();
      await projectFor(principal, task.projectId);
      if (result.projectId && task.projectId !== result.projectId) notFound();
    }
  } catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 404) {
      result.projectId = null;
      result.taskId = null;
    } else throw error;
  }
  if (result.meetId && !(await listMeets(principal)).some((meet) => meet.id === result.meetId)) result.meetId = null;
  return result;
}

export async function articleDetail(c: Context) {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'knowledge_read', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  const article = await articleFor(principal, idParam(c));
  return { ...article, ...await readableLinks(principal, article), renderedBody: renderKnowledgeMarkdown(article.body),
    canEdit: can(principal.permissions, 'knowledge.edit', article.departmentId),
    canPublish: can(principal.permissions, 'knowledge.publish', article.departmentId) };
}

export async function saveArticle(c: Context, input: v.InferOutput<typeof articleInput>, articleId?: string) {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'knowledge_edit', 60, 3600);
  const departmentId = input.scope === 'department' ? input.departmentId : null;
  if (input.scope === 'department' && !departmentId) notFound('department_not_found');
  if (departmentId) {
    await departmentOr404(departmentId);
    if (principal.person.departmentId !== departmentId && !can(principal.permissions, 'departments.workspace.view', departmentId)) notFound();
  }
  editor(principal, { departmentId }, 'knowledge.edit');
  const previous = articleId ? await articleFor(principal, articleId) : null;
  if (previous && (previous.scope !== input.scope || previous.departmentId !== departmentId)) conflict('article_scope_immutable');
  if (input.status !== 'draft') editor(principal, { departmentId }, 'knowledge.publish');
  const links = await readableLinks(principal, input);
  if (links.projectId !== input.projectId || links.taskId !== input.taskId || links.meetId !== input.meetId) notFound('linked_resource_not_found');
  const [duplicate] = await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, input.slug));
  if (duplicate && duplicate.id !== articleId) conflict('slug_exists');
  const article = {
    title: input.title, slug: input.slug, body: input.body, scope: input.scope, departmentId,
    status: input.status, tags: input.tags, ...links, revision: previous ? previous.revision + 1 : 1,
    updatedAt: new Date().toISOString(),
  };
  const targetId = articleId ?? crypto.randomUUID();
  if (previous && input.revision !== previous.revision) conflict('revision_changed');
  const mutation = previous
    ? db.update(articles).set(article).where(and(eq(articles.id, targetId), eq(articles.revision, previous.revision))).returning({ id: articles.id })
    : db.insert(articles).values({ ...article, id: targetId, ownerId: principal.person.id }).returning({ id: articles.id });
  const [changed] = await db.batch([
    mutation,
    db.insert(knowledgeRevisions).select(sql`
      SELECT NULL, ${targetId}, ${article.revision},
        ${JSON.stringify({ title: article.title, body: article.body, status: article.status, tags: article.tags, ...links })},
        ${principal.person.id}, datetime('now') WHERE changes() = 1
    `),
  ]);
  if (!changed.length) conflict('revision_changed');
  await audit(principal.person.id, previous ? 'knowledge.edit' : 'knowledge.create', 'knowledge_article', targetId, { status: article.status, revision: article.revision });
  return { id: targetId, revision: article.revision };
}

export async function articleHistory(c: Context) {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'knowledge_read', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  const article = await articleFor(principal, idParam(c));
  editor(principal, article, 'knowledge.edit');
  const rows = await db.select().from(knowledgeRevisions).where(eq(knowledgeRevisions.articleId, article.id))
    .orderBy(desc(knowledgeRevisions.number)).limit(100);
  const revisions = await Promise.all(rows.map(async (row) => ({
    ...row, snapshot: { ...row.snapshot, ...await readableLinks(principal, row.snapshot) },
  })));
  return { revisions };
}
