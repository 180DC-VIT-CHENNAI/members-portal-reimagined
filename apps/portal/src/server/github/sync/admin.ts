import { githubInstallations, githubIssues, githubRepositories, githubWebhookDeliveries, projects } from '@schema';
import { HTTPException } from 'hono/http-exception';
import type * as v from 'valibot';
import { and, db, desc, eq, isNull, like, or, sql } from 'void/db';
import { audit } from '../../audit';
import { conflict, notFound } from '../../http';
import type { Principal } from '../../principal';
import { github, githubHttpError, requireGitHub } from '../runtime';
import type { DeliveriesResponse, DeliveryRow, GitHubStatusResponse, RepositoriesResponse, RepositoryAdminRow, SyncStepResult } from '../types';
import { GITHUB_LIMITS, GITHUB_WEB_URL } from '../types';
import { ITEMS_PER_RUN, runGitHubSync, syncRepositoryStep } from './backfill';
import { refreshInstallations, statusFor } from './installations';
import type { deliveriesQuery, repositoriesQuery } from './inputs';
import { likePattern } from './board-rules';
import { purgeRepositoryData } from './retention';

const itemCount = sql<number>`(select count(*) from ${githubIssues} where ${githubIssues.repositoryId} = ${githubRepositories.id})`;

function adminQuery() {
  return db
    .select({ repository: githubRepositories, projectName: projects.name, items: itemCount })
    .from(githubRepositories)
    .leftJoin(projects, eq(projects.id, githubRepositories.projectId));
}

function adminRow(row: Awaited<ReturnType<typeof adminQuery>>[number]): RepositoryAdminRow {
  const repo = row.repository;
  return {
    id: repo.id,
    fullName: repo.fullName,
    htmlUrl: `${GITHUB_WEB_URL}/${repo.fullName}`,
    private: repo.private,
    archived: repo.archived,
    removed: repo.removedAt !== null,
    installationId: repo.installationId,
    defaultBranch: repo.defaultBranch,
    project: repo.projectId && row.projectName ? { id: repo.projectId, name: row.projectName } : null,
    syncStatus: repo.syncStatus,
    syncMode: repo.syncMode,
    lastSyncedAt: repo.lastSyncedAt,
    lastSyncError: repo.lastSyncError,
    itemCount: Number(row.items),
  };
}

export async function repositoriesFor(query: v.InferOutput<typeof repositoriesQuery>): Promise<RepositoriesResponse> {
  const rows = await adminQuery()
    .where(
      and(
        query.mapped === undefined ? undefined : query.mapped === 'true' ? sql`${githubRepositories.projectId} is not null` : isNull(githubRepositories.projectId),
        query.q ? like(sql`lower(${githubRepositories.fullName})`, likePattern(query.q.toLowerCase())) : undefined,
      ),
    )
    .orderBy(githubRepositories.fullName);
  return { repositories: rows.map(adminRow) };
}

async function oneRepository(repositoryId: number): Promise<RepositoriesResponse> {
  const [row] = await adminQuery().where(eq(githubRepositories.id, repositoryId));
  if (!row) notFound('repository_not_found');
  return { repositories: [adminRow(row)] };
}

async function loadRepository(repositoryId: number) {
  const [row] = await db.select().from(githubRepositories).where(eq(githubRepositories.id, repositoryId));
  if (!row) notFound('repository_not_found');
  return row;
}

export async function mapRepository(actor: Principal, repositoryId: number, projectId: string | null): Promise<RepositoriesResponse> {
  const before = await loadRepository(repositoryId);
  if (projectId !== null) {
    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
    if (!project) notFound('project_not_found');
    await db
      .update(githubRepositories)
      .set({
        projectId,
        mappedBy: actor.person.id,
        mappedAt: sql`datetime('now')`,
        syncStatus: 'queued',
        syncMode: 'full',
        syncCursor: null,
        syncPassStartedAt: null,
        syncFailures: 0,
        lastSyncError: null,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(githubRepositories.id, repositoryId));
    await audit(actor.person.id, 'github.repo.map', 'github_repository', String(repositoryId), { from: before.projectId, to: projectId, fullName: before.fullName });
    if (github()) {
      try {
        await syncRepositoryStep(repositoryId, { remaining: GITHUB_LIMITS.syncCallsPerRun, items: ITEMS_PER_RUN });
      } catch {
        // The mapping stands; the cron retries the first pass.
      }
    }
  } else {
    await db
      .update(githubRepositories)
      .set({
        projectId: null,
        mappedBy: null,
        mappedAt: null,
        syncStatus: 'idle',
        syncMode: 'full',
        syncCursor: null,
        syncPassStartedAt: null,
        lastSyncedAt: null,
        syncFailures: 0,
        lastSyncError: null,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(githubRepositories.id, repositoryId));
    await purgeRepositoryData(repositoryId);
    if (before.projectId !== null) await audit(actor.person.id, 'github.repo.unmap', 'github_repository', String(repositoryId), { from: before.projectId, fullName: before.fullName });
  }
  return oneRepository(repositoryId);
}

async function retryAfterSeconds(installationId: number): Promise<number> {
  const [row] = await db.select({ until: githubInstallations.rateLimitedUntil }).from(githubInstallations).where(eq(githubInstallations.id, installationId));
  return row?.until ? Math.max(1, Math.ceil((Date.parse(row.until) - Date.now()) / 1000)) : 60;
}

async function failFromResult(result: SyncStepResult, installationId: number): Promise<void> {
  switch (result.error) {
    case 'github_rate_limited':
      throw new HTTPException(503, { res: new Response('github_rate_limited', { status: 503, headers: { 'Retry-After': String(await retryAfterSeconds(installationId)) } }) });
    case 'github_app_forbidden':
    case 'github_unavailable':
      throw new HTTPException(502, { message: result.error });
    case 'repository_not_found':
      throw new HTTPException(404, { message: 'repository_not_found' });
  }
}

export async function syncRepositoryNow(actor: Principal, repositoryId: number, full: boolean): Promise<RepositoriesResponse> {
  const repository = await loadRepository(repositoryId);
  if (!repository.projectId) conflict('repository_not_mapped');
  requireGitHub();
  if (full) {
    await db
      .update(githubRepositories)
      .set({ syncMode: 'full', syncCursor: null, syncPassStartedAt: null, syncStatus: 'queued', updatedAt: sql`datetime('now')` })
      .where(eq(githubRepositories.id, repositoryId));
  }
  const result = await syncRepositoryStep(repositoryId, { remaining: GITHUB_LIMITS.syncCallsPerRun, items: ITEMS_PER_RUN });
  await audit(actor.person.id, 'github.repo.sync', 'github_repository', String(repositoryId), { full, status: result.status, calls: result.calls, upserted: result.upserted, error: result.error });
  await failFromResult(result, repository.installationId);
  return oneRepository(repositoryId);
}

export async function syncInstallationsNow(actor: Principal): Promise<GitHubStatusResponse> {
  requireGitHub();
  const budget = { remaining: GITHUB_LIMITS.syncCallsPerRun };
  let refreshed = 0;
  try {
    refreshed = await refreshInstallations(budget, { force: true, propagate: true });
  } catch (err) {
    githubHttpError(err, 'app', 'repository');
  }
  await audit(actor.person.id, 'github.installations.sync', 'github_installation', 'all', { refreshed });
  return statusFor();
}

export async function deliveriesFor(query: v.InferOutput<typeof deliveriesQuery>): Promise<DeliveriesResponse> {
  const [cursorAt, cursorId] = query.cursor?.split('|') ?? [];
  const before = cursorAt && cursorId ? or(sql`${githubWebhookDeliveries.receivedAt} < ${cursorAt}`, and(eq(githubWebhookDeliveries.receivedAt, cursorAt), sql`${githubWebhookDeliveries.id} < ${cursorId}`)) : undefined;
  const rows = await db
    .select()
    .from(githubWebhookDeliveries)
    .where(and(query.status === undefined ? undefined : eq(githubWebhookDeliveries.status, query.status), before))
    .orderBy(desc(githubWebhookDeliveries.receivedAt), desc(githubWebhookDeliveries.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    deliveries: page.map(
      (row): DeliveryRow => ({
        id: row.id,
        event: row.event,
        action: row.action,
        repositoryId: row.repositoryId,
        status: row.status,
        detail: row.detail,
        attempts: row.attempts,
        receivedAt: row.receivedAt,
        processedAt: row.processedAt,
      }),
    ),
    nextCursor: rows.length > query.limit && last ? `${last.receivedAt}|${last.id}` : null,
  };
}

export { runGitHubSync };
