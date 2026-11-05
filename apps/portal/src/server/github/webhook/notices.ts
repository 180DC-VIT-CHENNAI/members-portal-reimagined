import { githubAccounts, githubActivity, githubNotifications } from '@schema';
import { db, inArray, or, sql } from 'void/db';
import { GITHUB_LIMITS, type GhUser } from '../types.ts';
import { activityOf, noticeTargets } from './apply-rules.ts';

export interface WebhookEffect {
  readonly deliveryId: string;
  readonly repositoryId: number;
  readonly issueId: string;
  readonly event: string;
  readonly action: string | undefined;
  readonly payload: unknown;
}

export async function recordActivity(effect: WebhookEffect): Promise<void> {
  const plan = activityOf(effect.event, effect.action, effect.payload);
  if (!plan) return;
  const sender = (effect.payload as { sender?: GhUser }).sender;
  await db
    .insert(githubActivity)
    .values({
      deliveryId: effect.deliveryId,
      repositoryId: effect.repositoryId,
      issueId: effect.issueId,
      kind: plan.kind,
      actorGithubId: sender?.id ?? null,
      actorLogin: sender?.login ?? null,
      detail: plan.detail,
      occurredAt: plan.occurredAt,
    })
    .onConflictDoNothing();
}

export async function recordNotices(effect: WebhookEffect): Promise<void> {
  const targets = noticeTargets(effect.event, effect.action, effect.payload, GITHUB_LIMITS.mentionsPerItem);
  if (!targets.length) return;
  const ids = targets.flatMap((t) => (t.githubUserId === null ? [] : [t.githubUserId]));
  const logins = targets.flatMap((t) => (t.githubUserId === null && t.login ? [t.login.toLowerCase()] : []));
  const accounts = await db
    .select({ personId: githubAccounts.personId, githubUserId: githubAccounts.githubUserId, login: githubAccounts.login })
    .from(githubAccounts)
    .where(
      or(
        ids.length ? inArray(githubAccounts.githubUserId, ids) : undefined,
        logins.length ? inArray(sql<string>`lower(${githubAccounts.login})`, logins) : undefined,
      ),
    );
  if (!accounts.length) return;

  const sender = (effect.payload as { sender?: GhUser }).sender;
  const rows = new Map<string, typeof githubNotifications.$inferInsert>();
  for (const target of targets) {
    for (const account of accounts) {
      const matches = target.githubUserId !== null ? account.githubUserId === target.githubUserId : account.login.toLowerCase() === target.login?.toLowerCase();
      if (!matches || account.githubUserId === sender?.id) continue;
      const dedupeKey = `${target.kind}:${effect.issueId}:${effect.deliveryId}`;
      rows.set(`${account.personId}:${dedupeKey}`, {
        recipientId: account.personId,
        kind: target.kind,
        issueId: effect.issueId,
        actorGithubId: sender?.id ?? null,
        actorLogin: sender?.login ?? null,
        dedupeKey,
      });
    }
  }
  if (rows.size) await db.insert(githubNotifications).values([...rows.values()]).onConflictDoNothing();
}
