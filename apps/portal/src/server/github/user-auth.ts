/**
 * GitHub App user authorization (design 6.5): PKCE, authorize URL, code
 * exchange, refresh and revoke. Pure: `fetch` is injected, so tests use
 * fixtures. The client secret is only ever sent to GitHub.
 */
import { base64urlEncode } from './token-crypto.ts';
import { callGitHub, GitHubError } from './client.ts';
import {
  GITHUB_API_VERSION,
  GITHUB_USER_AGENT,
  type FetchLike,
  type GitHubSettings,
  type UserTokenGrant,
} from './types.ts';

function requireOAuth(settings: GitHubSettings): { readonly clientId: string; readonly clientSecret: string } {
  if (!settings.oauth) throw new Error('linking_not_configured');
  return settings.oauth;
}

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64urlEncode(digest) };
}

export function authorizeUrl(settings: GitHubSettings, input: { state: string; challenge: string; redirectUri: string }): string {
  const { clientId } = requireOAuth(settings);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    allow_signup: 'false',
  });
  return `${settings.webUrl}/login/oauth/authorize?${params.toString()}`;
}

function expiry(now: () => number, seconds: unknown): string | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(now() + seconds * 1000).toISOString() : null;
}

async function requestGrant(
  settings: GitHubSettings,
  fetch: FetchLike,
  fields: Readonly<Record<string, string>>,
  now: () => number,
): Promise<UserTokenGrant> {
  const { clientId, clientSecret } = requireOAuth(settings);
  const { response, text } = await callGitHub(fetch, `${settings.webUrl}/login/oauth/access_token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': GITHUB_USER_AGENT },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...fields }),
  });
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // handled by the shape check below
  }
  if (typeof body.error === 'string') throw new GitHubError({ kind: 'validation', status: response.status, message: body.error });
  if (typeof body.access_token !== 'string' || !body.access_token) {
    throw new GitHubError({ kind: 'unavailable', status: response.status, message: 'GitHub answered with an invalid token response' });
  }
  return {
    accessToken: body.access_token,
    accessTokenExpiresAt: expiry(now, body.expires_in),
    refreshToken: typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : null,
    refreshTokenExpiresAt: expiry(now, body.refresh_token_expires_in),
  };
}

export function exchangeCode(
  settings: GitHubSettings,
  fetch: FetchLike,
  input: { code: string; verifier: string; redirectUri: string },
  now: () => number = () => Date.now(),
): Promise<UserTokenGrant> {
  return requestGrant(settings, fetch, { code: input.code, redirect_uri: input.redirectUri, code_verifier: input.verifier }, now);
}

export function refreshUserToken(
  settings: GitHubSettings,
  fetch: FetchLike,
  refreshToken: string,
  now: () => number = () => Date.now(),
): Promise<UserTokenGrant> {
  return requestGrant(settings, fetch, { grant_type: 'refresh_token', refresh_token: refreshToken }, now);
}

/** Best effort: a token GitHub no longer knows (404) counts as revoked. */
export async function revokeUserToken(settings: GitHubSettings, fetch: FetchLike, accessToken: string): Promise<void> {
  const { clientId, clientSecret } = requireOAuth(settings);
  try {
    await callGitHub(fetch, `${settings.apiUrl}/applications/${clientId}/token`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'User-Agent': GITHUB_USER_AGENT,
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: JSON.stringify({ access_token: accessToken }),
    });
  } catch (err) {
    if (err instanceof GitHubError && err.kind === 'not_found') return;
    throw err;
  }
}
