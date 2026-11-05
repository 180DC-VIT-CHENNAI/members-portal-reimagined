/**
 * GitHub App authentication (design 6.2): the RS256 app JWT and a cached
 * installation-token source. Pure: `fetch` and the clock are injected.
 * Installation tokens live only in this in-memory map, never in D1 or logs.
 */
import { callGitHub, GitHubError } from './client.ts';
import { base64Decode, base64urlEncode } from './token-crypto.ts';
import { GITHUB_API_VERSION, GITHUB_USER_AGENT, type FetchLike, type GitHubClientOptions, type GitHubSettings } from './types.ts';

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  if (!body || body.includes('-----')) throw new Error('private_key_invalid');
  return base64Decode(body);
}

/** Imports a PKCS#8 PEM as an RS256 signing key. Throws when it is not one. */
export async function importAppKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pemToDer(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

function encodeJson(value: unknown): string {
  return base64urlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

/** `iat` is backdated 60 s for clock drift; `exp` is 9 minutes out (GitHub's maximum is 10). */
export async function signAppJwt(key: CryptoKey, appId: string, nowSeconds: number): Promise<string> {
  const signingInput = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: appId })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64urlEncode(signature)}`;
}

interface CachedToken {
  readonly token: string;
  readonly expiresAtMs: number;
}

export function createTokenSource(deps: {
  readonly settings: GitHubSettings;
  readonly fetch: FetchLike;
  readonly now?: () => number;
}): GitHubClientOptions['tokens'] {
  const { settings, fetch } = deps;
  const now = deps.now ?? (() => Date.now());
  const cache = new Map<number, CachedToken>();
  const inflight = new Map<number, Promise<string>>();
  let keyPromise: Promise<CryptoKey> | null = null;

  function signingKey(pem: string): Promise<CryptoKey> {
    keyPromise ??= importAppKey(pem).catch((err: unknown) => {
      keyPromise = null;
      throw err;
    });
    return keyPromise;
  }

  async function appJwt(): Promise<string> {
    if (!settings.app) throw new Error('github_not_configured');
    const key = await signingKey(settings.app.privateKeyPem);
    return signAppJwt(key, settings.app.appId, Math.floor(now() / 1000));
  }

  async function mint(installationId: number): Promise<string> {
    const jwt = await appJwt();
    const { response, text } = await callGitHub(fetch, `${settings.apiUrl}/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'User-Agent': GITHUB_USER_AGENT,
        Authorization: `Bearer ${jwt}`,
      },
    });
    let body: { token?: unknown; expires_at?: unknown } = {};
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      // handled by the shape check below
    }
    const expiresAtMs = typeof body.expires_at === 'string' ? Date.parse(body.expires_at) : Number.NaN;
    if (typeof body.token !== 'string' || !body.token || !Number.isFinite(expiresAtMs)) {
      throw new GitHubError({ kind: 'unavailable', status: response.status, message: 'GitHub answered with an invalid installation token' });
    }
    cache.set(installationId, { token: body.token, expiresAtMs });
    return body.token;
  }

  async function installationToken(installationId: number): Promise<string> {
    const hit = cache.get(installationId);
    if (hit && now() < hit.expiresAtMs - TOKEN_REFRESH_MARGIN_MS) return hit.token;
    const pending = inflight.get(installationId);
    if (pending) return pending;
    const request = mint(installationId).finally(() => inflight.delete(installationId));
    inflight.set(installationId, request);
    return request;
  }

  return { appJwt, installationToken };
}
