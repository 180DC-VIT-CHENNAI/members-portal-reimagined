import { githubAccounts, githubInstallations, githubIssueParticipants, githubIssues, githubOauthStates, githubRepositories, githubUserTokens, people } from '@schema';
import { HTTPException } from 'hono/http-exception';
import { and, db, desc, eq, isNull, sql } from 'void/db';
import { audit } from '../../audit';
import { notFound } from '../../http';
import { ACTIVE_STATUSES, type Principal } from '../../principal';
import { GitHubError } from '../client';
import { github, githubHttpError, githubSettings } from '../runtime';
import {
  type AccountLinkView,
  type AccountsResponse,
  type GhUser,
  type GitHubMeResponse,
  type LinkResult,
  GITHUB_LIMITS,
  type UserTokenState,
} from '../types';
import { exchangeCode, authorizeUrl, pkcePair, revokeUserToken } from '../user-auth';
import { storeUserTokens, userTokenFor } from '../user-tokens';
import { loginFromGithubUrl } from './accounts-rules';
import { sqliteMs } from './backfill-rules';
import { sha256Hex } from './write-rules';

type AccountRow = typeof githubAccounts.$inferSelect;

const accountColumns = {
  personId: people.id,
  fullName: people.fullName,
  photoKey: people.photoKey,
  email: people.email,
  status: people.status,
  githubUserId: githubAccounts.githubUserId,
  login: githubAccounts.login,
  method: githubAccounts.method,
  verifiedAt: githubAccounts.verifiedAt,
  createdAt: githubAccounts.createdAt,
  tokenState: githubUserTokens.state,
};

type AccountJoin = { [K in keyof typeof accountColumns]: (typeof accountColumns)[K]['_']['data'] };

function linkView(row: AccountJoin): AccountLinkView {
  return {
    person: { id: row.personId, fullName: row.fullName, photoKey: row.photoKey, email: row.email, status: row.status },
    githubUserId: row.githubUserId,
    login: row.login,
    method: row.method,
    verified: row.verifiedAt !== null,
    linkedAt: row.createdAt,
    tokenState: (row.tokenState ?? 'none') as UserTokenState | 'none',
  };
}

function accountQuery() {
  return db
    .select(accountColumns)
    .from(githubAccounts)
    .innerJoin(people, eq(people.id, githubAccounts.personId))
    .leftJoin(githubUserTokens, eq(githubUserTokens.personId, githubAccounts.personId));
}

export async function linkViewOf(personId: string): Promise<AccountLinkView | null> {
  const [row] = await accountQuery().where(eq(githubAccounts.personId, personId));
  return row ? linkView(row as AccountJoin) : null;
}

export async function meFor(principal: Principal): Promise<GitHubMeResponse> {
  const settings = githubSettings();
  const configured = github() !== null;
  const linkingAvailable = configured && settings.oauth !== null;
  const userTokensAvailable = linkingAvailable && settings.tokenEncryptionKey !== null && settings.configError === null;
  const link = await linkViewOf(principal.person.id);
  return {
    configured,
    linkingAvailable,
    userTokensAvailable,
    account: link
      ? {
          githubUserId: link.githubUserId,
          login: link.login,
          method: link.method,
          linkedAt: link.linkedAt,
          tokenState: link.tokenState,
          actsAsYou: userTokensAvailable && link.tokenState === 'active',
        }
      : null,
  };
}

export async function accountsOverview(): Promise<AccountsResponse> {
  const rows = await accountQuery().orderBy(people.fullName);
  const links = rows.map((row) => linkView(row as AccountJoin));

  const unlinked = await db
    .select({ id: people.id, fullName: people.fullName, photoKey: people.photoKey, email: people.email, status: people.status, githubUrl: people.githubUrl })
    .from(people)
    .leftJoin(githubAccounts, eq(githubAccounts.personId, people.id))
    .where(and(isNull(githubAccounts.personId), sql`${people.githubUrl} is not null`, sql`${people.status} in ${[...ACTIVE_STATUSES]}`))
    .orderBy(people.fullName);
  const suggestions = unlinked.flatMap((person) => {
    const login = loginFromGithubUrl(person.githubUrl);
    return login ? [{ person: { id: person.id, fullName: person.fullName, photoKey: person.photoKey, email: person.email, status: person.status }, login }] : [];
  });

  const open = and(eq(githubIssues.state, 'open'), sql`${githubRepositories.projectId} is not null`, isNull(githubRepositories.removedAt));
  const [assigned, authored] = await Promise.all([
    db
      .select({ githubUserId: githubIssueParticipants.githubUserId, login: githubIssueParticipants.login, issueId: githubIssueParticipants.issueId })
      .from(githubIssueParticipants)
      .innerJoin(githubIssues, eq(githubIssues.id, githubIssueParticipants.issueId))
      .innerJoin(githubRepositories, eq(githubRepositories.id, githubIssues.repositoryId))
      .leftJoin(githubAccounts, eq(githubAccounts.githubUserId, githubIssueParticipants.githubUserId))
      .where(and(open, eq(githubIssueParticipants.role, 'assignee'), isNull(githubAccounts.personId)))
      .limit(5000),
    db
      .select({ githubUserId: githubIssues.authorGithubId, login: githubIssues.authorLogin, issueId: githubIssues.id })
      .from(githubIssues)
      .innerJoin(githubRepositories, eq(githubRepositories.id, githubIssues.repositoryId))
      .leftJoin(githubAccounts, eq(githubAccounts.githubUserId, githubIssues.authorGithubId))
      .where(and(open, sql`${githubIssues.authorGithubId} is not null`, isNull(githubAccounts.personId)))
      .limit(5000),
  ]);
  const byUser = new Map<number, { login: string; issues: Set<string> }>();
  for (const row of [...assigned, ...authored]) {
    if (row.githubUserId === null || row.login === null) continue;
    const entry = byUser.get(row.githubUserId) ?? { login: row.login, issues: new Set<string>() };
    entry.issues.add(row.issueId);
    byUser.set(row.githubUserId, entry);
  }
  const unmatched = [...byUser.entries()]
    .map(([githubUserId, entry]) => ({ githubUserId, login: entry.login, openItems: entry.issues.size }))
    .sort((a, b) => b.openItems - a.openItems || a.login.localeCompare(b.login));
  return { links, suggestions, unmatched };
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startLink(principal: Principal, origin: string): Promise<string> {
  const settings = githubSettings();
  if (!settings.oauth || !github()) throw new HTTPException(503, { message: 'linking_not_configured' });
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const { verifier, challenge } = await pkcePair();
  await db.insert(githubOauthStates).values({
    stateHash: await sha256Hex(state),
    personId: principal.person.id,
    codeVerifier: verifier,
    expiresAt: sql`datetime('now', ${`+${GITHUB_LIMITS.oauthStateMinutes} minutes`})`,
  });
  return authorizeUrl(settings, { state, challenge, redirectUri: `${origin}/api/github/link/callback` });
}

async function takenBySomeoneElse(githubUserId: number, personId: string): Promise<boolean> {
  const [row] = await db.select({ personId: githubAccounts.personId }).from(githubAccounts).where(eq(githubAccounts.githubUserId, githubUserId));
  return row !== undefined && row.personId !== personId;
}

async function upsertAccount(personId: string, user: GhUser, link: { method: AccountRow['method']; linkedBy: string | null; verified: boolean }): Promise<void> {
  const [existing] = await db.select().from(githubAccounts).where(eq(githubAccounts.personId, personId));
  if (existing && existing.githubUserId !== user.id) await db.delete(githubUserTokens).where(eq(githubUserTokens.personId, personId));
  const keepOauth = existing?.githubUserId === user.id && existing.method === 'oauth' && link.method === 'admin';
  const values = keepOauth
    ? { login: user.login }
    : { githubUserId: user.id, login: user.login, method: link.method, linkedBy: link.linkedBy, verifiedAt: link.verified ? sql`datetime('now')` : null };
  await db
    .insert(githubAccounts)
    .values({ personId, githubUserId: user.id, login: user.login, method: link.method, linkedBy: link.linkedBy, verifiedAt: link.verified ? sql`datetime('now')` : null })
    .onConflictDoUpdate({ target: githubAccounts.personId, set: { ...values, updatedAt: sql`datetime('now')` } });
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE/i.test(err.message);
}

export async function finishLink(
  principal: Principal,
  origin: string,
  query: { code?: string | undefined; state?: string | undefined; error?: string | undefined },
): Promise<LinkResult> {
  const settings = githubSettings();
  const runtime = github();
  if (!query.state) return 'state_invalid';
  const [row] = await db
    .delete(githubOauthStates)
    .where(eq(githubOauthStates.stateHash, await sha256Hex(query.state)))
    .returning();
  if (!row || row.personId !== principal.person.id || sqliteMs(row.expiresAt) < Date.now()) return 'state_invalid';
  if (query.error) return 'denied';
  if (!query.code) return 'state_invalid';
  if (!runtime || !settings.oauth) return 'not_configured';

  let user: GhUser;
  let grant: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    grant = await exchangeCode(settings, runtime.fetch, { code: query.code, verifier: row.codeVerifier, redirectUri: `${origin}/api/github/link/callback` });
    user = (await runtime.client.request<GhUser>({ kind: 'user', token: grant.accessToken }, { path: '/user' })).data;
  } catch {
    return 'exchange_failed';
  }
  if (await takenBySomeoneElse(user.id, principal.person.id)) return 'taken';
  try {
    await upsertAccount(principal.person.id, user, { method: 'oauth', linkedBy: null, verified: true });
  } catch (err) {
    if (isUniqueViolation(err)) return 'taken';
    throw err;
  }
  if (settings.tokenEncryptionKey && !settings.configError) await storeUserTokens(principal.person.id, grant);
  await audit(principal.person.id, 'github.account.self_link', 'github_account', principal.person.id, { githubUserId: user.id, login: user.login });
  return 'linked';
}

export async function adminLink(actor: Principal, personId: string, login: string): Promise<AccountLinkView> {
  const [person] = await db.select({ id: people.id }).from(people).where(eq(people.id, personId));
  if (!person) notFound('person_not_found');
  const runtime = github();
  if (!runtime) throw new HTTPException(503, { message: 'github_not_configured' });
  const [installation] = await db
    .select({ id: githubInstallations.id })
    .from(githubInstallations)
    .where(and(isNull(githubInstallations.deletedAt), isNull(githubInstallations.suspendedAt)))
    .orderBy(desc(githubInstallations.updatedAt))
    .limit(1);
  if (!installation) throw new HTTPException(503, { message: 'github_not_configured' });

  let user: GhUser;
  try {
    user = (await runtime.client.request<GhUser>({ kind: 'installation', installationId: installation.id }, { path: `/users/${encodeURIComponent(login)}` })).data;
  } catch (err) {
    if (err instanceof GitHubError && err.kind === 'not_found') notFound('github_user_not_found');
    githubHttpError(err, 'app', 'repository');
  }
  if (user.type !== undefined && user.type !== 'User') notFound('github_user_not_found');
  if (await takenBySomeoneElse(user.id, personId)) throw new HTTPException(409, { message: 'github_account_taken' });
  const before = await linkViewOf(personId);
  try {
    await upsertAccount(personId, user, { method: 'admin', linkedBy: actor.person.id, verified: false });
  } catch (err) {
    if (isUniqueViolation(err)) throw new HTTPException(409, { message: 'github_account_taken' });
    throw err;
  }
  const link = await linkViewOf(personId);
  if (!link) notFound('person_not_found');
  await audit(actor.person.id, 'github.account.link', 'github_account', personId, {
    from: before ? { githubUserId: before.githubUserId, login: before.login } : null,
    to: { githubUserId: link.githubUserId, login: link.login, method: link.method },
  });
  return link;
}

export async function unlinkAccount(personId: string): Promise<AccountLinkView | null> {
  const before = await linkViewOf(personId);
  if (!before) return null;
  const runtime = github();
  if (runtime && runtime.settings.oauth && before.tokenState !== 'none') {
    try {
      const grant = await userTokenFor(personId);
      if (grant.token) await revokeUserToken(runtime.settings, runtime.fetch, grant.token);
    } catch {
      // Revoking at GitHub is best effort; the local token is deleted below either way.
    }
  }
  await db.delete(githubUserTokens).where(eq(githubUserTokens.personId, personId));
  await db.delete(githubAccounts).where(eq(githubAccounts.personId, personId));
  return before;
}
