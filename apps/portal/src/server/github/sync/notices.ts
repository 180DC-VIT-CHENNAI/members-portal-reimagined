import { githubIssues, githubNotifications, githubRepositories, projects } from '@schema';
import type * as v from 'valibot';
import { and, count, db, desc, eq, inArray, isNull, lt, lte } from 'void/db';
import type { Principal } from '../../principal';
import type { GitHubNoticeView, GitHubNoticesResponse } from '../types';
import { visibleRepositoryScope } from './access';
import type { markNoticesReadInput, noticesQuery } from './inputs';
import { userResolver } from './reads';

function visibleTo(principal: Principal) {
  return and(
    eq(githubNotifications.recipientId, principal.person.id),
    visibleRepositoryScope(principal),
  );
}

export async function unreadFor(principal: Principal): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(githubNotifications)
    .innerJoin(githubIssues, eq(githubIssues.id, githubNotifications.issueId))
    .innerJoin(githubRepositories, eq(githubRepositories.id, githubIssues.repositoryId))
    .where(and(visibleTo(principal), isNull(githubNotifications.readAt)));
  return row?.n ?? 0;
}

export async function noticesFor(principal: Principal, query: v.InferOutput<typeof noticesQuery>): Promise<GitHubNoticesResponse> {
  const rows = await db
    .select({
      notice: githubNotifications,
      kind: githubIssues.kind,
      number: githubIssues.number,
      title: githubIssues.title,
      repositoryFullName: githubRepositories.fullName,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(githubNotifications)
    .innerJoin(githubIssues, eq(githubIssues.id, githubNotifications.issueId))
    .innerJoin(githubRepositories, eq(githubRepositories.id, githubIssues.repositoryId))
    .innerJoin(projects, eq(projects.id, githubRepositories.projectId))
    .where(and(visibleTo(principal), query.before === undefined ? undefined : lt(githubNotifications.id, query.before)))
    .orderBy(desc(githubNotifications.id))
    .limit(query.limit);
  const resolve = await userResolver(rows.flatMap((row) => (row.notice.actorGithubId === null ? [] : [row.notice.actorGithubId])));
  const notices = rows.map(
    (row): GitHubNoticeView => ({
      id: row.notice.id,
      kind: row.notice.kind,
      item: { id: row.notice.issueId, kind: row.kind, number: row.number, title: row.title, repositoryFullName: row.repositoryFullName },
      project: { id: row.projectId, name: row.projectName },
      actor: row.notice.actorGithubId !== null && row.notice.actorLogin ? resolve(row.notice.actorGithubId, row.notice.actorLogin) : null,
      createdAt: row.notice.createdAt,
      readAt: row.notice.readAt,
    }),
  );
  return { notices, unread: await unreadFor(principal) };
}

export async function markNoticesRead(principal: Principal, input: v.InferOutput<typeof markNoticesReadInput>): Promise<number> {
  await db
    .update(githubNotifications)
    .set({ readAt: new Date().toISOString().replace('T', ' ').slice(0, 19) })
    .where(
      and(
        eq(githubNotifications.recipientId, principal.person.id),
        isNull(githubNotifications.readAt),
        'ids' in input ? inArray(githubNotifications.id, input.ids) : lte(githubNotifications.id, input.upTo),
      ),
    );
  return unreadFor(principal);
}
