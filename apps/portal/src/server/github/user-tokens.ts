import { githubAccounts, githubUserTokens } from '@schema';
import { db, eq, sql } from 'void/db';
import { GitHubError } from './client.ts';
import { githubSettings } from './runtime.ts';
import { openToken, sealToken } from './token-crypto.ts';
import { GITHUB_LIMITS, type FallbackReason, type UserTokenGrant } from './types.ts';
import { refreshUserToken } from './user-auth.ts';

export type UserTokenResult =
  | { readonly token: string; readonly login: string }
  | { readonly token: null; readonly reason: Exclude<FallbackReason, 'user_forbidden'> };

type TokenRow = typeof githubUserTokens.$inferSelect;

const REVOKED: UserTokenResult = { token: null, reason: 'token_revoked' };

/** Without an encryption key nothing is stored: linking still proves identity and writes go out as the App. */
export async function storeUserTokens(personId: string, grant: UserTokenGrant): Promise<void> {
  const key = githubSettings().tokenEncryptionKey;
  if (!key) return;
  const values = {
    state: 'active' as const,
    accessToken: await sealToken(key, personId, 'access', grant.accessToken),
    accessTokenExpiresAt: grant.accessTokenExpiresAt,
    refreshToken: grant.refreshToken ? await sealToken(key, personId, 'refresh', grant.refreshToken) : null,
    refreshTokenExpiresAt: grant.refreshTokenExpiresAt,
    revokedReason: null,
  };
  await db
    .insert(githubUserTokens)
    .values({ personId, ...values })
    .onConflictDoUpdate({ target: githubUserTokens.personId, set: { ...values, updatedAt: sql`datetime('now')` } });
}

export async function revokeUserTokens(personId: string, reason: string): Promise<void> {
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
    .where(eq(githubUserTokens.personId, personId));
}

async function refresh(personId: string, row: TokenRow, key: string, login: string, access: string, expiresAtMs: number): Promise<UserTokenResult> {
  const usable: UserTokenResult = { token: access, login };
  const stillValid = expiresAtMs > Date.now();
  const settings = githubSettings();
  if (!settings.oauth) return stillValid ? usable : { token: null, reason: 'no_token' };

  const refreshExpired = row.refreshTokenExpiresAt !== null && Date.parse(row.refreshTokenExpiresAt) <= Date.now();
  const refreshToken = row.refreshToken && !refreshExpired ? await openToken(key, personId, 'refresh', row.refreshToken) : null;
  if (refreshToken === null) {
    if (stillValid) return usable;
    await revokeUserTokens(personId, 'refresh_expired');
    return REVOKED;
  }

  try {
    const grant = await refreshUserToken(settings, (input, init) => globalThis.fetch(input, init), refreshToken);
    await storeUserTokens(personId, grant);
    return { token: grant.accessToken, login };
  } catch (err) {
    if (!(err instanceof GitHubError)) throw err;
    if (err.kind === 'validation' || err.kind === 'unauthorized' || err.kind === 'forbidden') {
      // Refresh tokens are single use: a concurrent request may have rotated the pair already.
      const [current] = await db.select().from(githubUserTokens).where(eq(githubUserTokens.personId, personId));
      if (current?.state === 'active' && current.accessToken && current.accessToken !== row.accessToken) {
        const rotated = await openToken(key, personId, 'access', current.accessToken);
        if (rotated !== null) return { token: rotated, login };
      }
      await revokeUserTokens(personId, 'bad_refresh_token');
      return REVOKED;
    }
    return stillValid ? usable : REVOKED;
  }
}

/** The person's GitHub user token, refreshed when it expires soon, or why writes must go out as the App (design 6.7). */
export async function userTokenFor(personId: string): Promise<UserTokenResult> {
  const [account] = await db.select({ login: githubAccounts.login }).from(githubAccounts).where(eq(githubAccounts.personId, personId));
  if (!account) return { token: null, reason: 'not_linked' };
  const [row] = await db.select().from(githubUserTokens).where(eq(githubUserTokens.personId, personId));
  if (!row) return { token: null, reason: 'no_token' };
  if (row.state === 'revoked' || !row.accessToken) return REVOKED;
  const key = githubSettings().tokenEncryptionKey;
  if (!key) return { token: null, reason: 'no_token' };

  const access = await openToken(key, personId, 'access', row.accessToken);
  if (access === null) return REVOKED;
  if (row.accessTokenExpiresAt === null) return { token: access, login: account.login };
  const expiresAtMs = Date.parse(row.accessTokenExpiresAt);
  if (expiresAtMs - Date.now() > GITHUB_LIMITS.userTokenRefreshMinutes * 60_000) return { token: access, login: account.login };
  return refresh(personId, row, key, account.login, access, expiresAtMs);
}
