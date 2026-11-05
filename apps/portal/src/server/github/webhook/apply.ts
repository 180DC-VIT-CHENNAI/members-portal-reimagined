import {
  githubAccounts,
  githubCommitChecks,
  githubInstallations,
  githubIssueLabels,
  githubIssueLinks,
  githubIssueParticipants,
  githubIssues,
  githubLabels,
  githubMilestones,
  githubRepositories,
  githubUserTokens,
} from '@schema';
import type { BatchItem } from 'drizzle-orm/batch';
import { and, db, eq, inArray, sql } from 'void/db';
import {
  issueKey,
  type ApplyContext,
  type GhCheckRun,
  type GhInstallation,
  type GhIssue,
  type GhLabel,
  type GhMilestone,
  type GhPullRequest,
  type GhRepository,
  type GhReview,
  type GhUser,
} from '../types.ts';
import {
  appliesOver,
  checkAggregate,
  checkRunValues,
  closingReferences,
  commitStatusValues,
  dueOnDate,
  issueValues,
  mergedFromIssue,
  mergeReview,
  ownerLogin,
  pullCommonValues,
  pullValues,
  reviewDecision,
  storedReviewOf,
  type CommitCheckValues,
  type CommonItemValues,
} from './apply-rules.ts';

type Statement = BatchItem<'sqlite'>;

export interface MappedRepository {
  readonly id: number;
  readonly installationId: number;
  readonly projectId: string;
  readonly ownerLogin: string;
  readonly name: string;
  readonly fullName: string;
  readonly archived: boolean;
}

const excluded = (column: { name: string }) => sql.raw(`excluded."${column.name}"`);

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function run(statements: Statement[]): Promise<void> {
  if (statements.length) await db.batch(statements as [Statement, ...Statement[]]);
}

export async function repositoryState(repositoryId: number): Promise<{ stored: boolean; mapped: MappedRepository | null }> {
  const [row] = await db.select().from(githubRepositories).where(eq(githubRepositories.id, repositoryId));
  if (!row) return { stored: false, mapped: null };
  if (!row.projectId || row.removedAt) return { stored: true, mapped: null };
  return {
    stored: true,
    mapped: {
      id: row.id,
      installationId: row.installationId,
      projectId: row.projectId,
      ownerLogin: row.ownerLogin,
      name: row.name,
      fullName: row.fullName,
      archived: row.archived,
    },
  };
}

export async function mappedRepository(repositoryId: number): Promise<MappedRepository | null> {
  return (await repositoryState(repositoryId)).mapped;
}

export async function installationKnown(installationId: number): Promise<boolean> {
  const [row] = await db.select({ id: githubInstallations.id }).from(githubInstallations).where(eq(githubInstallations.id, installationId));
  return Boolean(row);
}

export async function applyInstallation(installation: GhInstallation): Promise<void> {
  const values = {
    accountId: installation.account?.id ?? 0,
    accountLogin: installation.account?.login ?? '',
    accountType: installation.account?.type === 'User' ? ('User' as const) : ('Organization' as const),
    repositorySelection: installation.repository_selection,
    permissions: { ...(installation.permissions ?? {}) },
    events: [...(installation.events ?? [])],
    suspendedAt: installation.suspended_at ?? null,
  };
  await db
    .insert(githubInstallations)
    .values({ id: installation.id, ...values })
    .onConflictDoUpdate({
      target: githubInstallations.id,
      set: { ...values, deletedAt: null, updatedAt: sql`datetime('now')` },
    });
}

export async function setInstallationSuspended(installationId: number, suspendedAt: string | null): Promise<void> {
  await db
    .update(githubInstallations)
    .set({ suspendedAt, updatedAt: sql`datetime('now')` })
    .where(eq(githubInstallations.id, installationId));
}

export async function markInstallationDeleted(installationId: number): Promise<void> {
  await run([
    db.update(githubInstallations).set({ deletedAt: sql`datetime('now')`, updatedAt: sql`datetime('now')` }).where(eq(githubInstallations.id, installationId)),
    db
      .update(githubRepositories)
      .set({ removedAt: sql`datetime('now')`, updatedAt: sql`datetime('now')` })
      .where(and(eq(githubRepositories.installationId, installationId), sql`${githubRepositories.removedAt} IS NULL`)),
  ]);
}

export async function flagRepositoryListRefresh(installationId: number): Promise<void> {
  await db
    .update(githubInstallations)
    .set({ needsRepoSync: true, updatedAt: sql`datetime('now')` })
    .where(eq(githubInstallations.id, installationId));
}

export async function applyRepository(repo: GhRepository, installationId: number): Promise<void> {
  const base = { installationId, ownerLogin: ownerLogin(repo), name: repo.name, fullName: repo.full_name, private: repo.private };
  const optional = {
    ...(repo.archived === undefined ? {} : { archived: repo.archived }),
    ...(repo.default_branch === undefined ? {} : { defaultBranch: repo.default_branch }),
  };
  await db
    .insert(githubRepositories)
    .values({ id: repo.id, ...base, ...optional })
    .onConflictDoUpdate({ target: githubRepositories.id, set: { ...base, ...optional, updatedAt: sql`datetime('now')` } });
}

export async function clearRepositoriesRemoved(repositoryIds: readonly number[]): Promise<void> {
  if (!repositoryIds.length) return;
  await db.update(githubRepositories).set({ removedAt: null }).where(inArray(githubRepositories.id, [...repositoryIds]));
}

export async function markRepositoriesRemoved(repositoryIds: readonly number[]): Promise<void> {
  if (!repositoryIds.length) return;
  await db
    .update(githubRepositories)
    .set({ removedAt: sql`datetime('now')`, updatedAt: sql`datetime('now')` })
    .where(and(inArray(githubRepositories.id, [...repositoryIds]), sql`${githubRepositories.removedAt} IS NULL`));
}

function labelStatement(repositoryId: number, label: GhLabel): Statement {
  const values = { repositoryId, name: label.name, color: label.color, description: label.description ?? null };
  return db
    .insert(githubLabels)
    .values({ id: label.id, ...values })
    .onConflictDoUpdate({ target: githubLabels.id, set: { ...values, updatedAt: sql`datetime('now')` } });
}

function milestoneStatement(repositoryId: number, milestone: GhMilestone): Statement {
  const values = {
    repositoryId,
    number: milestone.number,
    title: milestone.title,
    description: milestone.description ?? null,
    state: milestone.state,
    dueOn: dueOnDate(milestone.due_on),
    openIssues: milestone.open_issues,
    closedIssues: milestone.closed_issues,
    githubCreatedAt: milestone.created_at,
    githubUpdatedAt: milestone.updated_at,
    closedAt: milestone.closed_at,
  };
  return db
    .insert(githubMilestones)
    .values({ id: milestone.id, ...values })
    .onConflictDoUpdate({
      target: githubMilestones.id,
      set: values,
      setWhere: sql`${githubMilestones.githubUpdatedAt} <= ${excluded(githubMilestones.githubUpdatedAt)}`,
    });
}

export async function applyLabel(repositoryId: number, label: GhLabel): Promise<void> {
  await run([labelStatement(repositoryId, label)]);
}

export async function deleteLabel(labelId: number): Promise<void> {
  await db.delete(githubLabels).where(eq(githubLabels.id, labelId));
}

export async function applyMilestone(repositoryId: number, milestone: GhMilestone): Promise<void> {
  await run([milestoneStatement(repositoryId, milestone)]);
}

export async function deleteMilestone(milestoneId: number): Promise<void> {
  await db.delete(githubMilestones).where(eq(githubMilestones.id, milestoneId));
}

export async function deleteIssue(repositoryId: number, number: number): Promise<void> {
  await db.delete(githubIssues).where(eq(githubIssues.id, issueKey(repositoryId, number)));
}

interface PullApply {
  readonly pull: ReturnType<typeof pullValues>;
  readonly linkTargets: readonly string[];
}

async function applyItem(
  values: CommonItemValues,
  extra: { readonly merged?: { merged: true; mergedAt: string } | null; readonly pull?: PullApply },
): Promise<{ id: string; changed: boolean }> {
  const [existing] = await db
    .select({ updated: githubIssues.githubUpdatedAt, pullUpdated: githubIssues.pullUpdatedAt, reviews: githubIssues.reviews })
    .from(githubIssues)
    .where(eq(githubIssues.id, values.id));
  const commonApplies = appliesOver(values.githubUpdatedAt, existing?.updated);
  const pullApplies = extra.pull !== undefined && appliesOver(extra.pull.pull.pullUpdatedAt, existing?.pullUpdated);
  if (!commonApplies && !pullApplies) return { id: values.id, changed: false };

  const statements: Statement[] = [];
  if (commonApplies) {
    if (values.milestone) statements.push(milestoneStatement(values.repositoryId, values.milestone));
    for (const label of values.labels) statements.push(labelStatement(values.repositoryId, label));
    const common = {
      title: values.title,
      body: values.body,
      state: values.state,
      stateReason: values.stateReason,
      htmlUrl: values.htmlUrl,
      authorGithubId: values.authorGithubId,
      authorLogin: values.authorLogin,
      milestoneId: values.milestone?.id ?? null,
      githubCreatedAt: values.githubCreatedAt,
      githubUpdatedAt: values.githubUpdatedAt,
      closedAt: values.closedAt,
      ...(values.commentCount === null ? {} : { commentCount: values.commentCount }),
      ...(extra.merged ? { merged: true, mergedAt: extra.merged.mergedAt } : {}),
    };
    statements.push(
      db
        .insert(githubIssues)
        .values({ id: values.id, repositoryId: values.repositoryId, number: values.number, kind: values.kind, ...common })
        .onConflictDoUpdate({
          target: githubIssues.id,
          set: {
            ...common,
            syncedAt: sql`datetime('now')`,
            version: sql`CASE WHEN ${excluded(githubIssues.githubUpdatedAt)} > ${githubIssues.githubUpdatedAt} THEN ${githubIssues.version} + 1 ELSE ${githubIssues.version} END`,
          },
          setWhere: sql`${githubIssues.githubUpdatedAt} <= ${excluded(githubIssues.githubUpdatedAt)}`,
        }),
      db.delete(githubIssueLabels).where(eq(githubIssueLabels.issueId, values.id)),
      db.delete(githubIssueParticipants).where(and(eq(githubIssueParticipants.issueId, values.id), eq(githubIssueParticipants.role, 'assignee'))),
    );
    for (const group of chunks(values.labels, 20)) {
      statements.push(db.insert(githubIssueLabels).values(group.map((label) => ({ issueId: values.id, labelId: label.id }))).onConflictDoNothing());
    }
    for (const group of chunks(values.assignees, 20)) {
      statements.push(
        db
          .insert(githubIssueParticipants)
          .values(group.map((user) => ({ issueId: values.id, role: 'assignee' as const, githubUserId: user.id, login: user.login })))
          .onConflictDoNothing(),
      );
    }
  }

  if (extra.pull && pullApplies) {
    const { pull, linkTargets } = extra.pull;
    const decision = reviewDecision(
      (existing?.reviews ?? []).filter((r) => r.state !== 'dismissed'),
      pull.requestedReviewers.length,
    );
    statements.push(
      db
        .update(githubIssues)
        .set({
          draft: pull.draft,
          merged: pull.merged,
          mergedAt: pull.mergedAt,
          headRef: pull.headRef,
          headSha: pull.headSha,
          baseRef: pull.baseRef,
          pullUpdatedAt: pull.pullUpdatedAt,
          reviewDecision: decision,
        })
        .where(and(eq(githubIssues.id, values.id), sql`(${githubIssues.pullUpdatedAt} IS NULL OR ${githubIssues.pullUpdatedAt} <= ${pull.pullUpdatedAt})`)),
      db.delete(githubIssueParticipants).where(and(eq(githubIssueParticipants.issueId, values.id), eq(githubIssueParticipants.role, 'reviewer'))),
      db.delete(githubIssueLinks).where(eq(githubIssueLinks.pullId, values.id)),
    );
    for (const group of chunks(pull.requestedReviewers, 20)) {
      statements.push(
        db
          .insert(githubIssueParticipants)
          .values(group.map((user) => ({ issueId: values.id, role: 'reviewer' as const, githubUserId: user.id, login: user.login })))
          .onConflictDoNothing(),
      );
    }
    for (const group of chunks(linkTargets, 40)) {
      statements.push(db.insert(githubIssueLinks).values(group.map((targetId) => ({ pullId: values.id, targetId }))).onConflictDoNothing());
    }
  }

  await run(statements);
  return { id: values.id, changed: true };
}

export async function applyIssue(repositoryId: number, issue: GhIssue, _ctx: ApplyContext): Promise<{ id: string; changed: boolean }> {
  return applyItem(issueValues(repositoryId, issue), { merged: mergedFromIssue(issue) });
}

async function linkTargetsOf(repositoryId: number, pull: GhPullRequest): Promise<string[]> {
  const refs = closingReferences(pull.body);
  if (!refs.length) return [];
  const [self] = await db.select({ fullName: githubRepositories.fullName }).from(githubRepositories).where(eq(githubRepositories.id, repositoryId));
  const selfName = self?.fullName.toLowerCase() ?? null;
  const others = [...new Set(refs.flatMap((ref) => (ref.fullName && ref.fullName !== selfName ? [ref.fullName] : [])))];
  const found = others.length
    ? await db
        .select({ id: githubRepositories.id, fullName: githubRepositories.fullName })
        .from(githubRepositories)
        .where(inArray(sql<string>`lower(${githubRepositories.fullName})`, others))
    : [];
  const idOf = new Map(found.map((row) => [row.fullName.toLowerCase(), row.id]));
  const targets = new Set<string>();
  for (const ref of refs) {
    if (!ref.fullName || ref.fullName === selfName) targets.add(issueKey(repositoryId, ref.number));
    else {
      const id = idOf.get(ref.fullName);
      if (id !== undefined) targets.add(issueKey(id, ref.number));
    }
  }
  targets.delete(issueKey(repositoryId, pull.number));
  return [...targets];
}

export async function applyPull(repositoryId: number, pull: GhPullRequest, _ctx: ApplyContext): Promise<{ id: string; changed: boolean }> {
  const result = await applyItem(pullCommonValues(repositoryId, pull), {
    pull: { pull: pullValues(pull), linkTargets: await linkTargetsOf(repositoryId, pull) },
  });
  if (result.changed) await recomputeCheckStatus(repositoryId, pull.head.sha);
  return result;
}

export async function applyReview(repositoryId: number, pullNumber: number, review: GhReview, _ctx: ApplyContext): Promise<void> {
  const stored = storedReviewOf(review);
  if (!stored) return;
  const id = issueKey(repositoryId, pullNumber);
  const [row] = await db.select({ reviews: githubIssues.reviews }).from(githubIssues).where(eq(githubIssues.id, id));
  if (!row) return;
  const reviews = mergeReview(row.reviews, stored);
  const [requested] = await db
    .select({ count: sql<number>`count(*)` })
    .from(githubIssueParticipants)
    .where(and(eq(githubIssueParticipants.issueId, id), eq(githubIssueParticipants.role, 'reviewer')));
  await db
    .update(githubIssues)
    .set({ reviews, reviewDecision: reviewDecision(reviews.filter((r) => r.state !== 'dismissed'), requested?.count ?? 0) })
    .where(eq(githubIssues.id, id));
}

export async function recomputeCheckStatus(repositoryId: number, sha: string): Promise<void> {
  const rows = await db
    .select({ state: githubCommitChecks.state, conclusion: githubCommitChecks.conclusion })
    .from(githubCommitChecks)
    .where(and(eq(githubCommitChecks.repositoryId, repositoryId), eq(githubCommitChecks.sha, sha)));
  await db
    .update(githubIssues)
    .set({ checkStatus: checkAggregate(rows) })
    .where(and(eq(githubIssues.repositoryId, repositoryId), eq(githubIssues.headSha, sha), eq(githubIssues.kind, 'pull')));
}

async function applyCheck(repositoryId: number, values: CommitCheckValues): Promise<boolean> {
  const row = {
    name: values.name,
    externalId: values.externalId,
    state: values.state,
    conclusion: values.conclusion,
    detailsUrl: values.detailsUrl,
  };
  const written = await db
    .insert(githubCommitChecks)
    .values({ repositoryId, sha: values.sha, source: values.source, checkKey: values.checkKey, ...row })
    .onConflictDoUpdate({
      target: [githubCommitChecks.repositoryId, githubCommitChecks.sha, githubCommitChecks.source, githubCommitChecks.checkKey],
      set: { ...row, updatedAt: sql`datetime('now')` },
      setWhere: sql`${githubCommitChecks.externalId} <= ${excluded(githubCommitChecks.externalId)}`,
    })
    .returning({ sha: githubCommitChecks.sha });
  if (!written.length) return false;
  await recomputeCheckStatus(repositoryId, values.sha);
  return true;
}

/** True when a row was written; false when the stored check has a higher id. */
export async function applyCheckRun(repositoryId: number, run: GhCheckRun): Promise<boolean> {
  return applyCheck(repositoryId, checkRunValues(run));
}

export async function applyCommitStatus(
  repositoryId: number,
  status: { id: number; sha: string; context: string; state: 'error' | 'failure' | 'pending' | 'success'; target_url: string | null },
): Promise<boolean> {
  return applyCheck(repositoryId, commitStatusValues(status));
}

export async function refreshLogins(users: readonly GhUser[]): Promise<void> {
  await run(
    users.map((user) =>
      db
        .update(githubAccounts)
        .set({ login: user.login, updatedAt: sql`datetime('now')` })
        .where(and(eq(githubAccounts.githubUserId, user.id), sql`${githubAccounts.login} <> ${user.login}`)),
    ),
  );
}

export async function revokeUserTokensOfGithubUser(githubUserId: number, reason: string): Promise<void> {
  const [account] = await db.select({ personId: githubAccounts.personId }).from(githubAccounts).where(eq(githubAccounts.githubUserId, githubUserId));
  if (!account) return;
  await db
    .update(githubUserTokens)
    .set({
      state: 'revoked',
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshToken: null,
      refreshTokenExpiresAt: null,
      revokedReason: reason,
      updatedAt: sql`datetime('now')`,
    })
    .where(eq(githubUserTokens.personId, account.personId));
}
