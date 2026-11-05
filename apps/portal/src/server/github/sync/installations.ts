import { githubInstallations, githubRepositories, githubWebhookDeliveries } from '@schema';
import { and, count, db, desc, eq, gte, isNull, max, sql } from 'void/db';
import { GitHubError } from '../client';
import { github, githubSettings } from '../runtime';
import {
  type GhInstallation,
  type GhRepository,
  type GitHubStatusResponse,
  type InstallationView,
  GITHUB_APP_PERMISSIONS,
  GITHUB_LIMITS,
  GITHUB_ORG,
} from '../types';
import { applyInstallation, applyRepository, clearRepositoriesRemoved, markInstallationDeleted, markRepositoriesRemoved } from '../webhook/apply';
import { isoAt, spend, sqliteMs, type SyncBudget } from './backfill-rules';
import { chunked } from './reads';

type InstallationRow = typeof githubInstallations.$inferSelect;

const LEVELS = { read: 1, write: 2, admin: 3 } as const;

export function missingPermissions(granted: Readonly<Record<string, string>>): string[] {
  return Object.entries(GITHUB_APP_PERMISSIONS)
    .filter(([key, needed]) => (LEVELS[granted[key] as keyof typeof LEVELS] ?? 0) < LEVELS[needed])
    .map(([key]) => key);
}

function installationView(row: InstallationRow): InstallationView {
  return {
    id: row.id,
    accountLogin: row.accountLogin,
    repositorySelection: row.repositorySelection,
    suspendedAt: row.suspendedAt,
    deletedAt: row.deletedAt,
    reposSyncedAt: row.reposSyncedAt,
    missingPermissions: missingPermissions(row.permissions),
  };
}

export async function statusFor(): Promise<GitHubStatusResponse> {
  const settings = githubSettings();
  const since = new Date(Date.now() - 86_400_000).toISOString().replace('T', ' ').slice(0, 19);
  const [installations, totals, failing, lastDelivery, failedDeliveries] = await Promise.all([
    db.select().from(githubInstallations).orderBy(githubInstallations.accountLogin),
    db
      .select({ total: count(), mapped: sql<number>`coalesce(sum(case when ${githubRepositories.projectId} is not null then 1 else 0 end), 0)` })
      .from(githubRepositories)
      .where(isNull(githubRepositories.removedAt)),
    db.select({ n: count() }).from(githubRepositories).where(and(eq(githubRepositories.syncStatus, 'failed'), sql`${githubRepositories.projectId} is not null`)),
    db.select({ at: max(githubWebhookDeliveries.receivedAt) }).from(githubWebhookDeliveries),
    db
      .select({ n: count() })
      .from(githubWebhookDeliveries)
      .where(and(eq(githubWebhookDeliveries.status, 'failed'), gte(githubWebhookDeliveries.receivedAt, since))),
  ]);
  return {
    org: GITHUB_ORG,
    configured: {
      app: settings.app !== null && settings.configError === null,
      webhook: settings.webhookSecret !== null,
      linking: settings.oauth !== null,
      userTokens: settings.oauth !== null && settings.tokenEncryptionKey !== null && settings.configError === null,
    },
    configError: settings.configError,
    installations: installations.map(installationView),
    repositories: { total: totals[0]?.total ?? 0, mapped: Number(totals[0]?.mapped ?? 0), failing: failing[0]?.n ?? 0 },
    deliveries: { lastReceivedAt: lastDelivery[0]?.at ?? null, failedLast24h: failedDeliveries[0]?.n ?? 0 },
  };
}

export async function recordRateLimit(installationId: number, err: GitHubError): Promise<void> {
  const until = isoAt(Date.now() + (err.retryAfterSeconds ?? 60) * 1000);
  await db.update(githubInstallations).set({ rateLimitedUntil: until, updatedAt: sql`datetime('now')` }).where(eq(githubInstallations.id, installationId));
}

function listingDue(rows: readonly InstallationRow[], force: boolean): boolean {
  if (force || rows.length === 0) return true;
  const newest = Math.max(...rows.map((row) => sqliteMs(row.updatedAt)));
  return Date.now() - newest >= GITHUB_LIMITS.repoListRefreshHours * 3_600_000;
}

async function listInstallations(budget: SyncBudget, rows: readonly InstallationRow[]): Promise<number> {
  const runtime = github();
  if (!runtime || budget.remaining < 1) return 0;
  const page = await runtime.client.paginate<GhInstallation>({ kind: 'app' }, { path: '/app/installations', query: { per_page: GITHUB_LIMITS.perPage }, maxPages: Math.min(3, budget.remaining) });
  spend(budget, page.calls);
  const ours = page.items.filter((installation) => installation.account?.login.toLowerCase() === GITHUB_ORG.toLowerCase());
  for (const installation of ours) await applyInstallation(installation);
  if (page.nextPage === null) {
    const seen = new Set(ours.map((installation) => installation.id));
    for (const row of rows) if (!row.deletedAt && !seen.has(row.id)) await markInstallationDeleted(row.id);
  }
  return ours.length;
}

function repositoryListDue(row: InstallationRow, force: boolean): boolean {
  if (row.deletedAt || row.suspendedAt) return false;
  if (row.rateLimitedUntil && Date.parse(row.rateLimitedUntil) > Date.now()) return false;
  if (force || row.needsRepoSync || row.reposSyncedAt === null) return true;
  return Date.now() - sqliteMs(row.reposSyncedAt) >= GITHUB_LIMITS.repoListRefreshHours * 3_600_000;
}

async function refreshRepositories(installationId: number, budget: SyncBudget): Promise<void> {
  const runtime = github();
  if (!runtime || budget.remaining < 2) return;
  const page = await runtime.client.paginate<GhRepository>(
    { kind: 'installation', installationId },
    { path: '/installation/repositories', query: { per_page: GITHUB_LIMITS.perPage }, maxPages: Math.min(10, budget.remaining - 1), itemsKey: 'repositories' },
  );
  spend(budget, page.calls + 1);
  const listed = new Set<number>();
  for (const repository of page.items) {
    await applyRepository(repository, installationId);
    listed.add(repository.id);
  }
  for (const chunk of chunked([...listed])) await clearRepositoriesRemoved(chunk);
  if (page.nextPage !== null) return;
  const current = await db
    .select({ id: githubRepositories.id })
    .from(githubRepositories)
    .where(and(eq(githubRepositories.installationId, installationId), isNull(githubRepositories.removedAt)));
  const gone = current.map((row) => row.id).filter((id) => !listed.has(id));
  for (const chunk of chunked(gone)) await markRepositoriesRemoved(chunk);
  await db
    .update(githubInstallations)
    .set({ reposSyncedAt: sql`datetime('now')`, needsRepoSync: false, updatedAt: sql`datetime('now')` })
    .where(eq(githubInstallations.id, installationId));
}

/** `propagate` rethrows GitHub errors (admin route); otherwise they are recorded per installation (cron). */
export async function refreshInstallations(budget: SyncBudget, options: { force: boolean; propagate: boolean }): Promise<number> {
  if (!github()) return 0;
  const guard = async (installationId: number | null, work: () => Promise<void>): Promise<void> => {
    try {
      await work();
    } catch (err) {
      if (options.propagate || !(err instanceof GitHubError)) throw err;
      if (err.kind === 'rate_limited' && installationId !== null) await recordRateLimit(installationId, err);
      else if (installationId !== null) await db.update(githubInstallations).set({ needsRepoSync: true }).where(eq(githubInstallations.id, installationId));
    }
  };

  let refreshed = 0;
  const rows = await db.select().from(githubInstallations).orderBy(desc(githubInstallations.updatedAt));
  if (listingDue(rows, options.force)) await guard(null, async () => void (refreshed = await listInstallations(budget, rows)));
  const current = await db.select().from(githubInstallations);
  for (const row of current) {
    if (!repositoryListDue(row, options.force) || budget.remaining < 2) continue;
    await guard(row.id, () => refreshRepositories(row.id, budget));
  }
  return refreshed;
}
