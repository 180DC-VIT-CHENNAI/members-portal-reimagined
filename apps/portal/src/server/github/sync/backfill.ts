import { githubInstallations, githubIssues, githubRepositories } from '@schema';
import { HTTPException } from 'hono/http-exception';
import { and, asc, db, eq, gt, gte, inArray, isNull, or, sql } from 'void/db';
import { GitHubError } from '../client';
import { github, type GitHubRuntime } from '../runtime';
import {
  type GhCheckRun,
  type GhIssue,
  type GhLabel,
  type GhMilestone,
  type GhPullRequest,
  type GhReview,
  type GitHubAuth,
  type RepoSyncMode,
  type RepoSyncStatus,
  type SyncCursor,
  type SyncRunSummary,
  type SyncStepResult,
  GITHUB_LIMITS,
} from '../types';
import { applyCheckRun, applyCommitStatus, applyIssue, applyLabel, applyMilestone, applyPull, applyReview } from '../webhook/apply';
import {
  advancePhase,
  canAfford,
  effectiveMode,
  isoAt,
  olderThan,
  orderDue,
  spend,
  startCursor,
  withAfter,
  withPage,
  type SyncBudget,
} from './backfill-rules';
import { refreshInstallations, recordRateLimit } from './installations';
import { pruneExpired, purgeUnmappedRepositories } from './retention';

const ITEMS_PER_RUN = 400;
const CTX = { source: 'sync', deliveryId: null, action: null, sender: null } as const;

type RepositoryRow = typeof githubRepositories.$inferSelect;

interface StepContext {
  readonly runtime: GitHubRuntime;
  readonly auth: GitHubAuth;
  readonly repositoryId: number;
  readonly fullName: string;
  readonly mode: RepoSyncMode;
  readonly budget: SyncBudget;
  calls: number;
  upserted: number;
}

export function syncErrorCode(err: unknown): string {
  if (!(err instanceof GitHubError)) return 'sync_error';
  switch (err.kind) {
    case 'rate_limited':
      return 'github_rate_limited';
    case 'not_found':
      return 'repository_not_found';
    case 'unauthorized':
    case 'forbidden':
      return 'github_app_forbidden';
    case 'unavailable':
    case 'network':
    case 'timeout':
      return 'github_unavailable';
    default:
      return 'github_error';
  }
}

async function page<T>(ctx: StepContext, path: string, query: Record<string, string | number>): Promise<{ items: T[]; nextPage: number | null }> {
  const response = await ctx.runtime.client.request<T[]>(ctx.auth, { path: `/repos/${ctx.fullName}${path}`, query: { per_page: GITHUB_LIMITS.perPage, ...query } });
  spend(ctx.budget, 1);
  ctx.calls += 1;
  return { items: response.data, nextPage: response.nextPage };
}

function applied(ctx: StepContext, count: number): void {
  ctx.upserted += count;
  if (ctx.budget.items !== undefined) ctx.budget.items -= count;
}

function unitCost(cursor: SyncCursor): number {
  return cursor.phase === 'checks' ? 2 : 1;
}

async function nextOpenPull(ctx: StepContext, cursor: SyncCursor): Promise<{ number: number; headSha: string | null } | null> {
  const filters = [
    eq(githubIssues.repositoryId, ctx.repositoryId),
    eq(githubIssues.kind, 'pull'),
    eq(githubIssues.state, 'open'),
    gt(githubIssues.number, cursor.afterNumber ?? 0),
  ];
  if (cursor.phase === 'checks') filters.push(sql`${githubIssues.headSha} is not null`);
  if (ctx.mode === 'incremental') {
    if (cursor.phase === 'reviews' && cursor.since) filters.push(gte(githubIssues.pullUpdatedAt, cursor.since));
    if (cursor.phase === 'checks') filters.push(inArray(githubIssues.checkStatus, ['none', 'pending']));
  }
  const [row] = await db
    .select({ number: githubIssues.number, headSha: githubIssues.headSha })
    .from(githubIssues)
    .where(and(...filters))
    .orderBy(asc(githubIssues.number))
    .limit(1);
  return row ?? null;
}

async function skipMissing<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof GitHubError && (err.kind === 'not_found' || err.kind === 'gone' || err.kind === 'conflict')) return null;
    throw err;
  }
}

/** Runs one page, or one pull request, of the cursor's phase. Returns the cursor to continue from, or null when the pass is complete. */
async function runUnit(ctx: StepContext, cursor: SyncCursor): Promise<SyncCursor | null> {
  const advance = (): SyncCursor | null => advancePhase(cursor, ctx.mode);
  switch (cursor.phase) {
    case 'labels': {
      const { items, nextPage } = await page<GhLabel>(ctx, '/labels', { page: cursor.page });
      for (const label of items) await applyLabel(ctx.repositoryId, label);
      applied(ctx, items.length);
      return nextPage ? withPage(cursor, nextPage) : advance();
    }
    case 'milestones': {
      const { items, nextPage } = await page<GhMilestone>(ctx, '/milestones', { state: 'all', page: cursor.page });
      for (const milestone of items) await applyMilestone(ctx.repositoryId, milestone);
      applied(ctx, items.length);
      return nextPage ? withPage(cursor, nextPage) : advance();
    }
    case 'open_issues':
    case 'recent_issues': {
      const open = cursor.phase === 'open_issues';
      const query: Record<string, string | number> = { state: open ? 'open' : 'all', sort: 'updated', direction: 'asc', page: cursor.page };
      if (!open && cursor.since) query.since = cursor.since;
      const { items, nextPage } = await page<GhIssue>(ctx, '/issues', query);
      for (const issue of items) await applyIssue(ctx.repositoryId, issue, CTX);
      applied(ctx, items.length);
      return nextPage ? withPage(cursor, nextPage) : advance();
    }
    case 'pulls': {
      const incremental = ctx.mode === 'incremental';
      const query: Record<string, string | number> = incremental ? { state: 'all', sort: 'updated', direction: 'desc', page: cursor.page } : { state: 'open', page: cursor.page };
      const { items, nextPage } = await page<GhPullRequest>(ctx, '/pulls', query);
      let reachedOld = false;
      for (const pull of items) {
        if (incremental && olderThan(pull.updated_at, cursor.since)) {
          reachedOld = true;
          break;
        }
        await applyPull(ctx.repositoryId, pull, CTX);
        applied(ctx, 1);
      }
      return nextPage && !reachedOld ? withPage(cursor, nextPage) : advance();
    }
    case 'reviews': {
      const pull = await nextOpenPull(ctx, cursor);
      if (!pull) return advance();
      const reviews = await skipMissing(() => page<GhReview>(ctx, `/pulls/${pull.number}/reviews`, { page: 1 }));
      for (const review of reviews?.items ?? []) await applyReview(ctx.repositoryId, pull.number, review, CTX);
      applied(ctx, reviews?.items.length ?? 0);
      return withAfter(cursor, pull.number);
    }
    case 'checks': {
      const pull = await nextOpenPull(ctx, cursor);
      if (!pull?.headSha) return advance();
      const sha = pull.headSha;
      const runs = await skipMissing(async () => {
        const response = await ctx.runtime.client.request<{ check_runs: GhCheckRun[] }>(ctx.auth, {
          path: `/repos/${ctx.fullName}/commits/${sha}/check-runs`,
          query: { per_page: GITHUB_LIMITS.perPage },
        });
        spend(ctx.budget, 1);
        ctx.calls += 1;
        return response.data.check_runs;
      });
      const statuses = await skipMissing(async () => {
        const response = await ctx.runtime.client.request<{ statuses: { id: number; context: string; state: 'error' | 'failure' | 'pending' | 'success'; target_url: string | null }[] }>(
          ctx.auth,
          { path: `/repos/${ctx.fullName}/commits/${sha}/status`, query: { per_page: GITHUB_LIMITS.perPage } },
        );
        spend(ctx.budget, 1);
        ctx.calls += 1;
        return response.data.statuses;
      });
      for (const run of runs ?? []) await applyCheckRun(ctx.repositoryId, run);
      for (const status of statuses ?? []) await applyCommitStatus(ctx.repositoryId, { id: status.id, sha, context: status.context, state: status.state, target_url: status.target_url });
      applied(ctx, (runs?.length ?? 0) + (statuses?.length ?? 0));
      return withAfter(cursor, pull.number);
    }
  }
}

async function saveProgress(repositoryId: number, cursor: SyncCursor, passStartedAt: string): Promise<void> {
  await db
    .update(githubRepositories)
    .set({ syncStatus: 'running', syncCursor: cursor, syncPassStartedAt: passStartedAt, updatedAt: sql`datetime('now')` })
    .where(eq(githubRepositories.id, repositoryId));
}

async function completePass(repositoryId: number, passStartedAt: string): Promise<void> {
  await db
    .update(githubRepositories)
    .set({
      syncStatus: 'idle',
      syncMode: 'incremental',
      syncCursor: null,
      syncPassStartedAt: null,
      lastSyncedAt: passStartedAt,
      syncFailures: 0,
      lastSyncError: null,
      updatedAt: sql`datetime('now')`,
    })
    .where(eq(githubRepositories.id, repositoryId));
}

async function recordFailure(row: RepositoryRow, err: unknown): Promise<string> {
  const code = syncErrorCode(err);
  if (err instanceof GitHubError && err.kind === 'rate_limited') {
    await recordRateLimit(row.installationId, err);
    return code;
  }
  const removed = err instanceof GitHubError && err.kind === 'not_found';
  await db
    .update(githubRepositories)
    .set({
      syncStatus: 'failed',
      lastSyncError: code,
      syncFailures: sql`${githubRepositories.syncFailures} + 1`,
      updatedAt: sql`datetime('now')`,
      ...(removed ? { removedAt: sql`datetime('now')` } : {}),
    })
    .where(eq(githubRepositories.id, row.id));
  return code;
}

export async function syncRepositoryStep(repositoryId: number, budget: SyncBudget): Promise<SyncStepResult> {
  const [found] = await db
    .select({ repository: githubRepositories, suspendedAt: githubInstallations.suspendedAt, deletedAt: githubInstallations.deletedAt, rateLimitedUntil: githubInstallations.rateLimitedUntil })
    .from(githubRepositories)
    .innerJoin(githubInstallations, eq(githubInstallations.id, githubRepositories.installationId))
    .where(eq(githubRepositories.id, repositoryId));
  if (!found || found.repository.removedAt) throw new HTTPException(404, { message: 'repository_not_found' });
  const row = found.repository;
  if (!row.projectId) throw new HTTPException(409, { message: 'repository_not_mapped' });
  if (found.suspendedAt || found.deletedAt) throw new HTTPException(503, { message: 'installation_suspended' });
  const runtime = github();
  if (!runtime) throw new HTTPException(503, { message: 'github_not_configured' });

  const idle = (error: string | null): SyncStepResult => ({ repositoryId, status: row.syncStatus, cursor: row.syncCursor, calls: 0, upserted: 0, error });
  if (found.rateLimitedUntil && Date.parse(found.rateLimitedUntil) > Date.now()) return idle('github_rate_limited');
  if (budget.remaining < 2 || (budget.items !== undefined && budget.items <= 0)) return idle(null);

  const mode = effectiveMode(row);
  const resuming = row.syncCursor !== null && row.syncPassStartedAt !== null;
  const passStartedAt = resuming ? (row.syncPassStartedAt as string) : isoAt(Date.now());
  let cursor: SyncCursor | null = resuming ? (row.syncCursor as SyncCursor) : startCursor(mode, passStartedAt, row.lastSyncedAt);
  const ctx: StepContext = {
    runtime,
    auth: { kind: 'installation', installationId: row.installationId },
    repositoryId,
    fullName: row.fullName,
    mode,
    budget,
    calls: 0,
    upserted: 0,
  };

  try {
    spend(budget, 1);
    ctx.calls += 1;
    if (!resuming) await saveProgress(repositoryId, cursor as SyncCursor, passStartedAt);
    while (cursor && canAfford(budget, unitCost(cursor)) && (budget.items === undefined || budget.items > 0)) {
      cursor = await runUnit(ctx, cursor);
      if (cursor) await saveProgress(repositoryId, cursor, passStartedAt);
    }
    if (cursor === null) await completePass(repositoryId, passStartedAt);
    const status: RepoSyncStatus = cursor === null ? 'idle' : 'running';
    return { repositoryId, status, cursor, calls: ctx.calls, upserted: ctx.upserted, error: null };
  } catch (err) {
    const error = await recordFailure(row, err);
    const rateLimited = error === 'github_rate_limited';
    return { repositoryId, status: rateLimited ? 'running' : 'failed', cursor, calls: ctx.calls, upserted: ctx.upserted, error };
  }
}

async function dueRepositories(): Promise<{ id: number; installationId: number; syncStatus: RepoSyncStatus; lastSyncedAt: string | null; updatedAt: string; syncFailures: number }[]> {
  const now = isoAt(Date.now());
  const rows = await db
    .select({
      id: githubRepositories.id,
      installationId: githubRepositories.installationId,
      syncStatus: githubRepositories.syncStatus,
      lastSyncedAt: githubRepositories.lastSyncedAt,
      updatedAt: githubRepositories.updatedAt,
      syncFailures: githubRepositories.syncFailures,
    })
    .from(githubRepositories)
    .innerJoin(githubInstallations, eq(githubInstallations.id, githubRepositories.installationId))
    .where(
      and(
        sql`${githubRepositories.projectId} is not null`,
        isNull(githubRepositories.removedAt),
        isNull(githubInstallations.deletedAt),
        isNull(githubInstallations.suspendedAt),
        or(isNull(githubInstallations.rateLimitedUntil), sql`${githubInstallations.rateLimitedUntil} <= ${now}`),
      ),
    );
  return orderDue(rows, Date.now());
}

export async function runGitHubSync(): Promise<SyncRunSummary> {
  const pruned = await pruneExpired();
  const purgedRepositories = await purgeUnmappedRepositories();
  if (!github()) return { installationsRefreshed: 0, repositories: [], purgedRepositories, pruned };

  const budget: SyncBudget = { remaining: GITHUB_LIMITS.syncCallsPerRun, items: ITEMS_PER_RUN };
  const installationsRefreshed = await refreshInstallations(budget, { force: false, propagate: false });
  const repositories: SyncStepResult[] = [];
  const limited = new Set<number>();
  for (const candidate of await dueRepositories()) {
    if (budget.remaining < 2 || (budget.items ?? 1) <= 0) break;
    if (limited.has(candidate.installationId)) continue;
    const result = await syncRepositoryStep(candidate.id, budget);
    repositories.push(result);
    if (result.error === 'github_rate_limited') limited.add(candidate.installationId);
  }
  return { installationsRefreshed, repositories, purgedRepositories, pruned };
}

export { ITEMS_PER_RUN };
