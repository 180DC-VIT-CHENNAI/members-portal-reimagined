import {
  githubAccounts,
  githubActivity,
  githubCommitChecks,
  githubIssueLabels,
  githubIssueLinks,
  githubIssueParticipants,
  githubIssues,
  githubLabels,
  githubMilestones,
  githubRepositories,
  people,
  projectMembers,
  projects,
} from '@schema';
import type { SQL } from 'drizzle-orm';
import * as v from 'valibot';
import { and, db, desc, eq, inArray, isNull, or, sql } from 'void/db';
import { loadActivePrincipals, type Principal } from '../../principal';
import { projectAccess } from '../../project-rules';
import type { LoadedProject } from '../../projects';
import { todayIso } from '../../status-history';
import { github } from '../runtime';
import {
  type ActivityResponse,
  type ActivityView,
  BOARD_COLUMN_TITLES,
  BOARD_COLUMNS,
  type BoardColumn,
  type BoardResponse,
  type CheckView,
  type CommentView,
  GITHUB_LIMITS,
  GITHUB_WEB_URL,
  type GhComment,
  type GitHubUserRef,
  type IssueCard,
  type IssueDetail,
  type LabelView,
  type LinkedItemRef,
  type MilestoneProgress,
  type MilestoneView,
  type MilestonesResponse,
  type MyWorkItem,
  type MyWorkResponse,
  type PersonRef,
  type ProjectGitHubResponse,
  type ProjectRef,
  type ProjectRepository,
  type PullFacts,
  type PullsResponse,
  type RepositoryRef,
} from '../types';
import { type IssueRow, type LoadedIssue, type RepositoryRow, canWriteIssues, visibleRepositoryScope } from './access';
import { asGitHubError } from './attribution-rules';
import { isoAt } from './backfill-rules';
import { columnFor, compareInColumn, likePattern, statusOfLabel } from './board-rules';
import type { activityQuery, boardQuery, milestonesQuery, pullsQuery } from './inputs';

/** D1 allows 100 bound parameters per statement. */
export function chunked<T>(items: readonly T[], size = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function inChunks<K, R>(keys: readonly K[], run: (chunk: K[]) => Promise<R[]>): Promise<R[]> {
  const parts = await Promise.all(chunked(keys).map(run));
  return parts.flat();
}

type MilestoneRow = typeof githubMilestones.$inferSelect;

export const noStore = (c: { header(name: string, value: string): void }): void => c.header('Cache-Control', 'private, no-store');

export function repositoryRef(row: Pick<RepositoryRow, 'id' | 'fullName' | 'private' | 'archived' | 'removedAt'>): RepositoryRef {
  return {
    id: row.id,
    fullName: row.fullName,
    htmlUrl: `${GITHUB_WEB_URL}/${row.fullName}`,
    private: row.private,
    archived: row.archived,
    removed: row.removedAt !== null,
  };
}

export const projectRefOf = (loaded: LoadedProject): ProjectRef => ({ id: loaded.project.id, name: loaded.project.name });

export function milestoneView(row: MilestoneRow): MilestoneView {
  return { id: row.id, number: row.number, title: row.title, state: row.state, dueOn: row.dueOn };
}

export type UserResolver = (id: number, login: string) => GitHubUserRef;

/** Joins GitHub user ids to portal people, so a later link applies to every existing item. */
export async function userResolver(ids: Iterable<number>): Promise<UserResolver> {
  const unique = [...new Set(ids)];
  const rows = await inChunks(unique, (chunk) =>
    db
      .select({ githubUserId: githubAccounts.githubUserId, id: people.id, fullName: people.fullName, photoKey: people.photoKey })
      .from(githubAccounts)
      .innerJoin(people, eq(people.id, githubAccounts.personId))
      .where(inArray(githubAccounts.githubUserId, chunk)),
  );
  const byUser = new Map<number, PersonRef>(rows.map((row) => [row.githubUserId, { id: row.id, fullName: row.fullName, photoKey: row.photoKey }]));
  return (id, login) => ({ githubUserId: id, login, person: byUser.get(id) ?? null });
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const list = out.get(key(item));
    if (list) list.push(item);
    else out.set(key(item), [item]);
  }
  return out;
}

function linkedFromRow(row: IssueRow, repoName: string | null): LinkedItemRef {
  return {
    id: row.id,
    repositoryFullName: repoName,
    number: row.number,
    kind: row.kind,
    title: row.title,
    state: row.state,
    merged: row.merged,
    checkStatus: row.checkStatus,
    htmlUrl: row.htmlUrl,
  };
}

function unsyncedTarget(targetId: string): LinkedItemRef {
  return {
    id: null,
    repositoryFullName: null,
    number: Number(targetId.slice(targetId.lastIndexOf('-') + 1)),
    kind: 'issue',
    title: null,
    state: null,
    merged: false,
    checkStatus: 'none',
    htmlUrl: null,
  };
}

/** Hydrates issue rows into cards, in the same order. Callers decide visibility. */
export async function cardsFor(rows: readonly IssueRow[]): Promise<IssueCard[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const milestoneIds = [...new Set(rows.flatMap((row) => (row.milestoneId === null ? [] : [row.milestoneId])))];

  const [milestoneRows, labelRows, participants, closingLinks, targetLinks] = await Promise.all([
    inChunks(milestoneIds, (chunk) => db.select().from(githubMilestones).where(inArray(githubMilestones.id, chunk))),
    inChunks(ids, (chunk) =>
      db
        .select({ issueId: githubIssueLabels.issueId, id: githubLabels.id, name: githubLabels.name, color: githubLabels.color })
        .from(githubIssueLabels)
        .innerJoin(githubLabels, eq(githubLabels.id, githubIssueLabels.labelId))
        .where(inArray(githubIssueLabels.issueId, chunk)),
    ),
    inChunks(ids, (chunk) => db.select().from(githubIssueParticipants).where(inArray(githubIssueParticipants.issueId, chunk))),
    inChunks(ids, (chunk) => db.select().from(githubIssueLinks).where(inArray(githubIssueLinks.targetId, chunk))),
    inChunks(ids, (chunk) => db.select().from(githubIssueLinks).where(inArray(githubIssueLinks.pullId, chunk))),
  ]);

  const linkedIds = [...new Set([...closingLinks.map((link) => link.pullId), ...targetLinks.map((link) => link.targetId)])];
  const linkedRows = await inChunks(linkedIds, (chunk) => db.select().from(githubIssues).where(inArray(githubIssues.id, chunk)));
  const repositoryIds = [...new Set([...rows, ...linkedRows].map((row) => row.repositoryId))];
  const repositories = await inChunks(repositoryIds, (chunk) =>
    db.select({ id: githubRepositories.id, fullName: githubRepositories.fullName }).from(githubRepositories).where(inArray(githubRepositories.id, chunk)),
  );
  const repoName = new Map(repositories.map((repo) => [repo.id, repo.fullName]));
  const linkedById = new Map(linkedRows.map((row) => [row.id, row]));
  const milestoneById = new Map(milestoneRows.map((row) => [row.id, row]));

  const userIds: number[] = [];
  for (const row of rows) {
    if (row.authorGithubId !== null) userIds.push(row.authorGithubId);
    for (const review of row.reviews) userIds.push(review.githubUserId);
  }
  for (const participant of participants) userIds.push(participant.githubUserId);
  const resolve = await userResolver(userIds);

  const labelsBy = groupBy(labelRows, (label) => label.issueId);
  const participantsBy = groupBy(participants, (participant) => participant.issueId);
  const closingBy = groupBy(closingLinks, (link) => link.targetId);
  const targetsBy = groupBy(targetLinks, (link) => link.pullId);
  const today = todayIso();

  return rows.map((row): IssueCard => {
    const labels: LabelView[] = (labelsBy.get(row.id) ?? []).map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      status: statusOfLabel(label.name),
    }));
    const people = participantsBy.get(row.id) ?? [];
    const assignees = people.filter((p) => p.role === 'assignee').map((p) => resolve(p.githubUserId, p.login));
    const milestoneRow = row.milestoneId === null ? undefined : milestoneById.get(row.milestoneId);
    const milestone = milestoneRow ? milestoneView(milestoneRow) : null;

    const closingPulls = (closingBy.get(row.id) ?? []).flatMap((link) => {
      const pull = linkedById.get(link.pullId);
      return pull ? [pull] : [];
    });
    const links: LinkedItemRef[] =
      row.kind === 'issue'
        ? closingPulls.map((pull) => linkedFromRow(pull, repoName.get(pull.repositoryId) ?? null))
        : (targetsBy.get(row.id) ?? []).map((link) => {
            const target = linkedById.get(link.targetId);
            return target ? linkedFromRow(target, repoName.get(target.repositoryId) ?? null) : unsyncedTarget(link.targetId);
          });

    const column = columnFor({
      kind: row.kind,
      state: row.state,
      draft: row.draft,
      labelNames: labels.map((label) => label.name),
      openClosingPulls: closingPulls.filter((pull) => pull.state === 'open').length,
    });
    const pull: PullFacts | null =
      row.kind === 'pull'
        ? {
            draft: row.draft,
            merged: row.merged,
            mergedAt: row.mergedAt,
            headRef: row.headRef,
            baseRef: row.baseRef,
            checkStatus: row.checkStatus,
            reviewDecision: row.reviewDecision,
            requestedReviewers: people.filter((p) => p.role === 'reviewer').map((p) => resolve(p.githubUserId, p.login)),
            reviews: row.reviews.map((review) => ({ ...review, person: resolve(review.githubUserId, review.login).person })),
          }
        : null;
    const effectiveDueDate = row.dueDate ?? milestone?.dueOn ?? null;

    return {
      id: row.id,
      kind: row.kind,
      repository: { id: row.repositoryId, fullName: repoName.get(row.repositoryId) ?? '' },
      number: row.number,
      title: row.title,
      state: row.state,
      stateReason: row.stateReason,
      column,
      htmlUrl: row.htmlUrl,
      author: row.authorGithubId !== null && row.authorLogin ? resolve(row.authorGithubId, row.authorLogin) : null,
      assignees,
      labels,
      milestone,
      dueDate: row.dueDate,
      effectiveDueDate,
      overdue: row.state === 'open' && effectiveDueDate !== null && effectiveDueDate < today,
      commentCount: row.commentCount,
      links,
      pull,
      createdAt: row.githubCreatedAt,
      updatedAt: row.githubUpdatedAt,
      closedAt: row.closedAt,
      version: row.version,
    };
  });
}

export async function cardFor(issueId: string): Promise<IssueCard | null> {
  const [row] = await db.select().from(githubIssues).where(eq(githubIssues.id, issueId));
  return row ? ((await cardsFor([row]))[0] ?? null) : null;
}

export function projectRepositories(projectId: string): Promise<RepositoryRow[]> {
  return db.select().from(githubRepositories).where(eq(githubRepositories.projectId, projectId));
}

export async function githubUserIdOf(personId: string): Promise<number | null> {
  const [row] = await db.select({ id: githubAccounts.githubUserId }).from(githubAccounts).where(eq(githubAccounts.personId, personId));
  return row?.id ?? null;
}

const participates = (role: 'assignee' | 'reviewer', userId: number): SQL =>
  sql`exists (select 1 from ${githubIssueParticipants} where ${githubIssueParticipants.issueId} = ${githubIssues.id} and ${githubIssueParticipants.role} = ${role} and ${githubIssueParticipants.githubUserId} = ${userId})`;

const NOTHING = sql`0`;

async function assigneeFilter(principal: Principal, value: string): Promise<SQL> {
  if (value === 'none') {
    return sql`not exists (select 1 from ${githubIssueParticipants} where ${githubIssueParticipants.issueId} = ${githubIssues.id} and ${githubIssueParticipants.role} = 'assignee')`;
  }
  const userId = await githubUserIdOf(value === 'me' ? principal.person.id : value);
  return userId === null ? NOTHING : participates('assignee', userId);
}

export async function boardFor(principal: Principal, loaded: LoadedProject, query: v.InferOutput<typeof boardQuery>): Promise<BoardResponse> {
  const repositories = await projectRepositories(loaded.project.id);
  const repositoryIds = repositories.map((repo) => repo.id);
  const empty = BOARD_COLUMNS.map((key) => ({ key, title: BOARD_COLUMN_TITLES[key], items: [] as IssueCard[] }));
  if (repositoryIds.length === 0) return { columns: empty, truncated: false };

  const doneSince = isoAt(Date.now() - GITHUB_LIMITS.doneColumnDays * 86_400_000);
  const filters: (SQL | undefined)[] = [
    inArray(githubIssues.repositoryId, repositoryIds),
    eq(githubIssues.kind, 'issue'),
    or(eq(githubIssues.state, 'open'), sql`${githubIssues.closedAt} >= ${doneSince}`),
  ];
  if (query.repo !== undefined) filters.push(eq(githubIssues.repositoryId, query.repo));
  if (query.milestone !== undefined) filters.push(eq(githubIssues.milestoneId, query.milestone));
  if (query.label) {
    filters.push(
      sql`exists (select 1 from ${githubIssueLabels} join ${githubLabels} on ${githubLabels.id} = ${githubIssueLabels.labelId} where ${githubIssueLabels.issueId} = ${githubIssues.id} and ${githubLabels.name} = ${query.label})`,
    );
  }
  if (query.assignee) filters.push(await assigneeFilter(principal, query.assignee));
  if (query.q) filters.push(sql`lower(${githubIssues.title}) like ${likePattern(query.q.toLowerCase())} escape '\\'`);

  const rows = await db
    .select()
    .from(githubIssues)
    .where(and(...filters))
    .orderBy(desc(githubIssues.githubUpdatedAt))
    .limit(GITHUB_LIMITS.boardItems + 1);
  const truncated = rows.length > GITHUB_LIMITS.boardItems;
  const cards = await cardsFor(rows.slice(0, GITHUB_LIMITS.boardItems));
  return {
    truncated,
    columns: BOARD_COLUMNS.map((key: BoardColumn) => ({
      key,
      title: BOARD_COLUMN_TITLES[key],
      items: cards.filter((card) => card.column === key).sort(compareInColumn(key)),
    })),
  };
}

export async function pullsFor(principal: Principal, loaded: LoadedProject, query: v.InferOutput<typeof pullsQuery>): Promise<PullsResponse> {
  const repositoryIds = (await projectRepositories(loaded.project.id)).map((repo) => repo.id);
  if (repositoryIds.length === 0) return { pulls: [] };
  const filters: (SQL | undefined)[] = [inArray(githubIssues.repositoryId, repositoryIds), eq(githubIssues.kind, 'pull')];
  if (query.state !== 'all') filters.push(eq(githubIssues.state, query.state));
  if (query.repo !== undefined) filters.push(eq(githubIssues.repositoryId, query.repo));
  if (query.author === 'me') {
    const userId = await githubUserIdOf(principal.person.id);
    filters.push(userId === null ? NOTHING : eq(githubIssues.authorGithubId, userId));
  }
  const rows = await db
    .select()
    .from(githubIssues)
    .where(and(...filters))
    .orderBy(desc(githubIssues.githubUpdatedAt))
    .limit(GITHUB_LIMITS.boardItems);
  return { pulls: await cardsFor(rows) };
}

function* daysBetween(from: string, to: string): Generator<string> {
  for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= Date.parse(`${to}T00:00:00Z`); ms += 86_400_000) {
    yield new Date(ms).toISOString().slice(0, 10);
  }
}

export async function milestonesFor(loaded: LoadedProject, query: v.InferOutput<typeof milestonesQuery>): Promise<MilestonesResponse> {
  const repositoryIds = (await projectRepositories(loaded.project.id)).map((repo) => repo.id);
  if (repositoryIds.length === 0) return { milestones: [] };
  const recent = isoAt(Date.now() - 90 * 86_400_000);
  const rows = await db
    .select()
    .from(githubMilestones)
    .where(
      and(
        inArray(githubMilestones.repositoryId, repositoryIds),
        query.repo === undefined ? undefined : eq(githubMilestones.repositoryId, query.repo),
        or(eq(githubMilestones.state, 'open'), sql`${githubMilestones.closedAt} >= ${recent}`),
      ),
    );
  const closedRows = await inChunks(
    rows.map((row) => row.id),
    (chunk) =>
      db
        .select({ milestoneId: githubIssues.milestoneId, closedAt: githubIssues.closedAt })
        .from(githubIssues)
        .where(and(inArray(githubIssues.milestoneId, chunk), eq(githubIssues.state, 'closed'))),
  );
  const closedBy = groupBy(closedRows, (row) => row.milestoneId);
  const today = todayIso();
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const milestones = rows
    .map((row): MilestoneProgress => {
      const created = row.githubCreatedAt.slice(0, 10);
      const counts = new Map<string, number>();
      for (const item of closedBy.get(row.id) ?? []) {
        const day = item.closedAt?.slice(0, 10);
        if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
      }
      return {
        repositoryId: row.repositoryId,
        milestone: milestoneView(row),
        open: row.openIssues,
        closed: row.closedIssues,
        closedByDay: [...daysBetween(created > monthAgo ? created : monthAgo, today)].map((date) => ({ date, closed: counts.get(date) ?? 0 })),
      };
    })
    .sort((a, b) => (a.milestone.dueOn ?? '9999').localeCompare(b.milestone.dueOn ?? '9999') || a.milestone.id - b.milestone.id);
  return { milestones };
}

type ActivityRow = typeof githubActivity.$inferSelect;

async function activityViews(rows: readonly ActivityRow[]): Promise<ActivityView[]> {
  const resolve = await userResolver(rows.flatMap((row) => (row.actorGithubId === null ? [] : [row.actorGithubId])));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    issueId: row.issueId,
    actor: row.actorGithubId !== null && row.actorLogin ? resolve(row.actorGithubId, row.actorLogin) : null,
    detail: row.detail,
    occurredAt: row.occurredAt,
  }));
}

export async function activityFor(loaded: LoadedProject, query: v.InferOutput<typeof activityQuery>): Promise<ActivityResponse> {
  const repositoryIds = (await projectRepositories(loaded.project.id)).map((repo) => repo.id);
  if (repositoryIds.length === 0) return { activity: [], nextBefore: null };
  const rows = await db
    .select()
    .from(githubActivity)
    .where(and(inArray(githubActivity.repositoryId, repositoryIds), query.before === undefined ? undefined : sql`${githubActivity.id} < ${query.before}`))
    .orderBy(desc(githubActivity.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  return { activity: await activityViews(page), nextBefore: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null };
}

async function liveComments(
  loaded: LoadedIssue,
  resolveFor: (comments: readonly GhComment[]) => Promise<UserResolver>,
): Promise<{ comments: CommentView[] | null; error: IssueDetail['commentsError'] }> {
  const runtime = github();
  if (!runtime) return { comments: null, error: 'github_not_configured' };
  try {
    const page = await runtime.client.paginate<GhComment>(
      { kind: 'installation', installationId: loaded.repository.installationId },
      {
        path: `/repos/${loaded.repository.fullName}/issues/${loaded.issue.number}/comments`,
        query: { per_page: GITHUB_LIMITS.perPage },
        maxPages: 1,
      },
    );
    const resolve = await resolveFor(page.items);
    return {
      error: null,
      comments: page.items.map((comment) => ({
        id: comment.id,
        author: comment.user ? resolve(comment.user.id, comment.user.login) : null,
        body: comment.body,
        htmlUrl: comment.html_url,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
      })),
    };
  } catch (err) {
    return { comments: null, error: asGitHubError(err)?.kind === 'rate_limited' ? 'github_rate_limited' : 'github_unavailable' };
  }
}

export async function issueDetail(principal: Principal, loaded: LoadedIssue): Promise<IssueDetail> {
  const issue = loaded.issue;
  const [card, checks, activityRows, live] = await Promise.all([
    cardsFor([issue]).then((cards) => cards[0] as IssueCard),
    issue.kind === 'pull' && issue.headSha
      ? db
          .select()
          .from(githubCommitChecks)
          .where(and(eq(githubCommitChecks.repositoryId, issue.repositoryId), eq(githubCommitChecks.sha, issue.headSha)))
      : Promise.resolve([]),
    db
      .select()
      .from(githubActivity)
      .where(eq(githubActivity.issueId, issue.id))
      .orderBy(desc(githubActivity.occurredAt), desc(githubActivity.id))
      .limit(GITHUB_LIMITS.activityPerIssue),
    liveComments(loaded, (comments) => userResolver(comments.flatMap((comment) => (comment.user ? [comment.user.id] : [])))),
  ]);
  return {
    ...card,
    body: issue.body,
    project: projectRefOf(loaded.project),
    access: { write: canWriteIssues(principal, loaded.project) },
    checks: checks.map((check): CheckView => ({ source: check.source, name: check.name, state: check.state, conclusion: check.conclusion, detailsUrl: check.detailsUrl })),
    activity: await activityViews(activityRows),
    comments: live.comments,
    commentsError: live.error,
  };
}

export async function projectSummary(principal: Principal, loaded: LoadedProject): Promise<ProjectGitHubResponse> {
  const repositories = await projectRepositories(loaded.project.id);
  const repositoryIds = repositories.map((repo) => repo.id);
  const recent = isoAt(Date.now() - 90 * 86_400_000);
  const [labelRows, milestoneRows, members, linked] = await Promise.all([
    inChunks(repositoryIds, (chunk) => db.select().from(githubLabels).where(inArray(githubLabels.repositoryId, chunk))),
    inChunks(repositoryIds, (chunk) =>
      db
        .select()
        .from(githubMilestones)
        .where(and(inArray(githubMilestones.repositoryId, chunk), or(eq(githubMilestones.state, 'open'), sql`${githubMilestones.closedAt} >= ${recent}`))),
    ),
    db.select({ personId: projectMembers.personId }).from(projectMembers).where(eq(projectMembers.projectId, loaded.project.id)),
    db
      .select({ githubUserId: githubAccounts.githubUserId, login: githubAccounts.login, personId: githubAccounts.personId })
      .from(githubAccounts)
      .innerJoin(people, eq(people.id, githubAccounts.personId)),
  ]);
  const memberIds = new Set(members.map((member) => member.personId));
  const principals = new Map((await loadActivePrincipals()).map((p) => [p.person.id, p]));
  const resolve = await userResolver(linked.map((link) => link.githubUserId));
  const assignable = linked
    .filter((link) => {
      const candidate = principals.get(link.personId);
      return candidate !== undefined && projectAccess(candidate.permissions, loaded.departmentIds, memberIds.has(link.personId), loaded.project.internal).view;
    })
    .map((link) => resolve(link.githubUserId, link.login))
    .sort((a, b) => (a.person?.fullName ?? a.login).localeCompare(b.person?.fullName ?? b.login));

  const labelsBy = groupBy(labelRows, (label) => label.repositoryId);
  const milestonesBy = groupBy(milestoneRows, (milestone) => milestone.repositoryId);
  return {
    configured: github() !== null,
    access: { write: canWriteIssues(principal, loaded) },
    assignable,
    repositories: repositories.map(
      (repo): ProjectRepository => ({
        ...repositoryRef(repo),
        labels: (labelsBy.get(repo.id) ?? [])
          .map((label) => ({ id: label.id, name: label.name, color: label.color, status: statusOfLabel(label.name) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        milestones: (milestonesBy.get(repo.id) ?? []).map(milestoneView).sort((a, b) => a.number - b.number),
        syncStatus: repo.syncStatus,
        lastSyncedAt: repo.lastSyncedAt,
      }),
    ),
  };
}

async function workItems(principal: Principal, extra: SQL | undefined, limit = 100): Promise<MyWorkItem[]> {
  const rows = await db
    .select({ issue: githubIssues, projectId: projects.id, projectName: projects.name })
    .from(githubIssues)
    .innerJoin(githubRepositories, eq(githubRepositories.id, githubIssues.repositoryId))
    .innerJoin(projects, eq(projects.id, githubRepositories.projectId))
    .where(and(eq(githubIssues.state, 'open'), isNull(githubRepositories.removedAt), visibleRepositoryScope(principal), extra))
    .orderBy(desc(githubIssues.githubUpdatedAt))
    .limit(limit);
  const cards = await cardsFor(rows.map((row) => row.issue));
  return cards.map((card, index) => ({ ...card, project: { id: rows[index]?.projectId ?? '', name: rows[index]?.projectName ?? '' } }));
}

export async function myWork(principal: Principal): Promise<MyWorkResponse> {
  const [account] = await db
    .select({ githubUserId: githubAccounts.githubUserId, login: githubAccounts.login })
    .from(githubAccounts)
    .where(eq(githubAccounts.personId, principal.person.id));
  if (!account) return { linked: false, login: null, assigned: [], reviewRequested: [], authored: [], overdue: [] };
  const [assigned, reviewRequested, authored] = await Promise.all([
    workItems(principal, participates('assignee', account.githubUserId)),
    workItems(principal, and(eq(githubIssues.kind, 'pull'), participates('reviewer', account.githubUserId))),
    workItems(principal, and(eq(githubIssues.kind, 'pull'), eq(githubIssues.authorGithubId, account.githubUserId))),
  ]);
  return { linked: true, login: account.login, assigned, reviewRequested, authored, overdue: assigned.filter((item) => item.overdue) };
}
