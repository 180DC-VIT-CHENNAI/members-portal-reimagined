import { HTTPException } from 'hono/http-exception';
import { env } from 'void/env';
import { createTokenSource } from './app.ts';
import { createGitHubClient, GitHubError } from './client.ts';
import { parseGitHubSettings } from './config.ts';
import type { FetchLike, GitHubClient, GitHubSettings } from './types.ts';

export interface GitHubRuntime {
  readonly settings: GitHubSettings;
  readonly client: GitHubClient;
  readonly fetch: FetchLike;
}

export function githubSettings(): GitHubSettings {
  const production = Boolean(import.meta.env.PROD) || env.ENVIRONMENT === 'production';
  return parseGitHubSettings(
    {
      GITHUB_APP_ID: env.GITHUB_APP_ID,
      GITHUB_APP_PRIVATE_KEY: env.GITHUB_APP_PRIVATE_KEY,
      GITHUB_WEBHOOK_SECRET: env.GITHUB_WEBHOOK_SECRET,
      GITHUB_APP_CLIENT_ID: env.GITHUB_APP_CLIENT_ID,
      GITHUB_APP_CLIENT_SECRET: env.GITHUB_APP_CLIENT_SECRET,
      GITHUB_TOKEN_ENCRYPTION_KEY: env.GITHUB_TOKEN_ENCRYPTION_KEY,
      GITHUB_TEST_API_URL: env.GITHUB_TEST_API_URL,
    },
    production,
  );
}

// One runtime per isolate: it owns the installation-token cache, and the
// environment cannot change while the isolate lives.
let memo: GitHubRuntime | null | undefined;

/** Null without usable app credentials (design 3.2). */
export function github(): GitHubRuntime | null {
  if (memo !== undefined) return memo;
  const settings = githubSettings();
  if (!settings.app) {
    memo = null;
    return memo;
  }
  const fetch: FetchLike = (input, init) => globalThis.fetch(input, init);
  const tokens = createTokenSource({ settings, fetch });
  memo = { settings, fetch, client: createGitHubClient({ fetch, apiUrl: settings.apiUrl, tokens }) };
  return memo;
}

export function requireGitHub(): GitHubRuntime {
  return github() ?? notConfigured();
}

function notConfigured(): never {
  throw new HTTPException(503, { message: 'github_not_configured' });
}

function fail(status: 404 | 409 | 422 | 502, code: string): never {
  throw new HTTPException(status, { message: code });
}

/** Maps a GitHub failure to the HTTP answer of design 9.6. Anything that is not a GitHubError is rethrown. */
export function githubHttpError(err: unknown, _mode: 'user' | 'app', target: 'issue' | 'repository'): never {
  if (!(err instanceof GitHubError)) throw err;
  switch (err.kind) {
    case 'rate_limited': {
      const headers: Record<string, string> = err.retryAfterSeconds === null ? {} : { 'Retry-After': String(err.retryAfterSeconds) };
      throw new HTTPException(503, { res: new Response('github_rate_limited', { status: 503, headers }) });
    }
    case 'validation':
      return fail(422, 'github_validation_failed');
    case 'conflict':
      return fail(409, 'github_conflict');
    case 'gone':
      return fail(409, 'issues_disabled');
    case 'unauthorized':
    case 'forbidden':
      return fail(502, 'github_app_forbidden');
    case 'not_found':
      return fail(404, target === 'issue' ? 'issue_not_found' : 'repository_not_found');
    case 'unavailable':
    case 'network':
    case 'timeout':
      return fail(502, 'github_unavailable');
  }
}
