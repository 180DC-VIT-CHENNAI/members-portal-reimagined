import {
  githubActivity,
  githubCommitChecks,
  githubIssues,
  githubLabels,
  githubMilestones,
  githubNotifications,
  githubOauthStates,
  githubRepositories,
  githubWebhookDeliveries,
  githubWriteRequests,
} from '@schema';
import { and, db, eq, isNull, sql } from 'void/db';
import { GITHUB_LIMITS, GITHUB_RETENTION_DAYS, type SyncRunSummary } from '../types';

const ago = (days: number) => sql`datetime('now', ${`-${days} days`})`;

type Pruned = SyncRunSummary['pruned'];

export async function pruneExpired(): Promise<Pruned> {
  const [deliveries, oauthStates, writeRequests, activity, readNotifications, staleChecks] = await Promise.all([
    db.delete(githubWebhookDeliveries).where(sql`${githubWebhookDeliveries.receivedAt} < ${ago(GITHUB_RETENTION_DAYS.deliveries)}`).returning({ id: githubWebhookDeliveries.id }),
    db.delete(githubOauthStates).where(sql`${githubOauthStates.expiresAt} < datetime('now')`).returning({ id: githubOauthStates.stateHash }),
    db.delete(githubWriteRequests).where(sql`${githubWriteRequests.createdAt} < ${ago(GITHUB_RETENTION_DAYS.writeRequests)}`).returning({ id: githubWriteRequests.requestId }),
    db.delete(githubActivity).where(sql`${githubActivity.createdAt} < ${ago(GITHUB_RETENTION_DAYS.activity)}`).returning({ id: githubActivity.id }),
    db
      .delete(githubNotifications)
      .where(and(sql`${githubNotifications.readAt} is not null`, sql`${githubNotifications.readAt} < ${ago(GITHUB_RETENTION_DAYS.readNotifications)}`))
      .returning({ id: githubNotifications.id }),
    db
      .delete(githubCommitChecks)
      .where(
        and(
          sql`${githubCommitChecks.updatedAt} < ${ago(GITHUB_RETENTION_DAYS.staleChecks)}`,
          sql`not exists (select 1 from ${githubIssues} where ${githubIssues.repositoryId} = ${githubCommitChecks.repositoryId} and ${githubIssues.headSha} = ${githubCommitChecks.sha} and ${githubIssues.kind} = 'pull' and ${githubIssues.state} = 'open')`,
        ),
      )
      .returning({ sha: githubCommitChecks.sha }),
  ]);
  return {
    deliveries: deliveries.length,
    oauthStates: oauthStates.length,
    writeRequests: writeRequests.length,
    activity: activity.length,
    readNotifications: readNotifications.length,
    staleChecks: staleChecks.length,
  };
}

export async function purgeRepositoryData(repositoryId: number): Promise<void> {
  await db.delete(githubIssues).where(eq(githubIssues.repositoryId, repositoryId));
  await db.delete(githubActivity).where(eq(githubActivity.repositoryId, repositoryId));
  await db.delete(githubCommitChecks).where(eq(githubCommitChecks.repositoryId, repositoryId));
  await db.delete(githubLabels).where(eq(githubLabels.repositoryId, repositoryId));
  await db.delete(githubMilestones).where(eq(githubMilestones.repositoryId, repositoryId));
}

export async function purgeUnmappedRepositories(limit: number = GITHUB_LIMITS.purgesPerRun): Promise<number> {
  const leftovers = await db
    .select({ id: githubRepositories.id })
    .from(githubRepositories)
    .where(
      and(
        isNull(githubRepositories.projectId),
        sql`(exists (select 1 from ${githubIssues} where ${githubIssues.repositoryId} = ${githubRepositories.id})
          or exists (select 1 from ${githubLabels} where ${githubLabels.repositoryId} = ${githubRepositories.id})
          or exists (select 1 from ${githubMilestones} where ${githubMilestones.repositoryId} = ${githubRepositories.id})
          or exists (select 1 from ${githubCommitChecks} where ${githubCommitChecks.repositoryId} = ${githubRepositories.id})
          or exists (select 1 from ${githubActivity} where ${githubActivity.repositoryId} = ${githubRepositories.id}))`,
      ),
    )
    .limit(limit);
  for (const repository of leftovers) await purgeRepositoryData(repository.id);
  return leftovers.length;
}
