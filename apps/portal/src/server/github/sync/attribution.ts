import type { Principal } from '../../principal';
import type { Attribution, FallbackReason, GitHubAuth } from '../types';
import { revokeUserTokens, userTokenFor } from '../user-tokens';
import { asGitHubError, decideUserFailure } from './attribution-rules';

export const NO_ATTRIBUTION: Attribution = { mode: 'app', login: null, fallbackReason: null, appliedAsApp: [] };

const asApp = (reason: FallbackReason): Attribution => ({ mode: 'app', login: null, fallbackReason: reason, appliedAsApp: [] });

/** Runs a GitHub write as the actor when they have a usable user token, else as the App (design 9.1). */
export async function writeAs<T>(
  actor: Principal,
  installationId: number,
  run: (auth: GitHubAuth, mode: 'user' | 'app') => Promise<T>,
): Promise<{ value: T; attribution: Attribution }> {
  const app: GitHubAuth = { kind: 'installation', installationId };
  const grant = await userTokenFor(actor.person.id);
  if (grant.token === null) return { value: await run(app, 'app'), attribution: asApp(grant.reason) };
  try {
    const value = await run({ kind: 'user', token: grant.token }, 'user');
    return { value, attribution: { mode: 'user', login: grant.login, fallbackReason: null, appliedAsApp: [] } };
  } catch (err) {
    const decision = decideUserFailure(asGitHubError(err));
    if (!decision.retry) throw err;
    if (decision.revokeToken) await revokeUserTokens(actor.person.id, 'unauthorized');
    return { value: await run(app, 'app'), attribution: asApp(decision.reason) };
  }
}
