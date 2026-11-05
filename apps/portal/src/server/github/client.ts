/**
 * Typed GitHub REST client (design 6.3). Pure: every HTTP call goes through
 * the injected `fetch`, credentials come from the injected token source, and
 * nothing is logged. Errors are `GitHubError` with a `kind` the routes map to
 * HTTP codes (runtime.ts `githubHttpError`).
 */
import {
  GITHUB_API_VERSION,
  GITHUB_LIMITS,
  GITHUB_USER_AGENT,
  type FetchLike,
  type GitHubAuth,
  type GitHubClient,
  type GitHubClientOptions,
  type GitHubErrorInfo,
  type GitHubErrorKind,
  type GitHubRateLimit,
  type GitHubRequest,
  type GitHubResponse,
} from './types.ts';

export class GitHubError extends Error implements GitHubErrorInfo {
  readonly kind: GitHubErrorKind;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;
  readonly documentationUrl: string | null;

  constructor(info: {
    readonly kind: GitHubErrorKind;
    readonly message: string;
    readonly status?: number | null;
    readonly retryAfterSeconds?: number | null;
    readonly documentationUrl?: string | null;
  }) {
    super(info.message);
    this.name = 'GitHubError';
    this.kind = info.kind;
    this.status = info.status ?? null;
    this.retryAfterSeconds = info.retryAfterSeconds ?? null;
    this.documentationUrl = info.documentationUrl ?? null;
  }
}

function numberHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readRateLimit(headers: Headers): GitHubRateLimit {
  const reset = numberHeader(headers, 'x-ratelimit-reset');
  return {
    limit: numberHeader(headers, 'x-ratelimit-limit'),
    remaining: numberHeader(headers, 'x-ratelimit-remaining'),
    resetAt: reset === null ? null : new Date(reset * 1000).toISOString(),
  };
}

/** Page number of the Link header's rel="next" entry; null on the last page. */
export function readNextPage(headers: Headers): number | null {
  const link = headers.get('link');
  if (!link) return null;
  const match = /<([^>]+)>\s*;\s*rel="next"/.exec(link);
  if (!match?.[1]) return null;
  try {
    const page = Number(new URL(match[1]).searchParams.get('page'));
    return Number.isInteger(page) && page > 0 ? page : null;
  } catch {
    return null;
  }
}

function retryAfterSeconds(headers: Headers, kind: GitHubErrorKind, nowMs: number): number | null {
  const header = headers.get('retry-after');
  if (header !== null && header.trim() !== '') {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, Math.ceil((date - nowMs) / 1000));
  }
  if (kind === 'rate_limited') {
    const reset = numberHeader(headers, 'x-ratelimit-reset');
    if (reset !== null) return Math.max(0, Math.ceil(reset - nowMs / 1000));
  }
  return null;
}

function kindFor(status: number, headers: Headers, message: string): GitHubErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) {
    const rateLimited = headers.get('x-ratelimit-remaining') === '0' || headers.has('retry-after') || /rate limit/i.test(message);
    return rateLimited ? 'rate_limited' : 'forbidden';
  }
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 410) return 'gone';
  if (status === 422) return 'validation';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'validation';
  return 'unavailable';
}

/** Builds the error for a non-2xx response from its already-read body text. */
export function errorFromResponse(response: Response, text: string, nowMs: number = Date.now()): GitHubError {
  let message = text.trim().slice(0, 300);
  let documentationUrl: string | null = null;
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object') {
      const record = body as { message?: unknown; documentation_url?: unknown };
      if (typeof record.message === 'string') message = record.message.slice(0, 300);
      if (typeof record.documentation_url === 'string') documentationUrl = record.documentation_url;
    }
  } catch {
    // not JSON: keep the trimmed text
  }
  if (!message) message = `GitHub answered ${response.status}`;
  const kind = kindFor(response.status, response.headers, message);
  return new GitHubError({
    kind,
    status: response.status,
    message,
    retryAfterSeconds: retryAfterSeconds(response.headers, kind, nowMs),
    documentationUrl,
  });
}

function transportError(err: unknown): GitHubError {
  if (err instanceof GitHubError) return err;
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') return new GitHubError({ kind: 'timeout', message: 'GitHub request timed out' });
  return new GitHubError({ kind: 'network', message: 'GitHub request failed' });
}

/**
 * One HTTP exchange: sends, reads the body inside the timeout, and throws a
 * `GitHubError` for a thrown fetch, an abort or any non-2xx answer. Shared
 * with app.ts and user-auth.ts so every call maps errors the same way.
 */
export async function callGitHub(
  fetch: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number = GITHUB_LIMITS.requestTimeoutMs,
): Promise<{ readonly response: Response; readonly text: string }> {
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    text = await response.text();
  } catch (err) {
    throw transportError(err);
  }
  if (!response.ok) throw errorFromResponse(response, text);
  return { response, text };
}

function buildUrl(apiUrl: string, request: GitHubRequest, extraQuery?: Readonly<Record<string, string | number | boolean | undefined>>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...request.query, ...extraQuery })) {
    if (value !== undefined) params.set(key, String(value));
  }
  const query = params.toString();
  return `${apiUrl.replace(/\/+$/, '')}${request.path}${query ? `?${query}` : ''}`;
}

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const timeoutMs = options.timeoutMs ?? GITHUB_LIMITS.requestTimeoutMs;

  async function bearer(auth: GitHubAuth): Promise<string> {
    if (auth.kind === 'app') return options.tokens.appJwt();
    if (auth.kind === 'installation') return options.tokens.installationToken(auth.installationId);
    return auth.token;
  }

  async function send<T>(
    auth: GitHubAuth,
    request: GitHubRequest,
    extraQuery?: Readonly<Record<string, string | number | boolean | undefined>>,
  ): Promise<GitHubResponse<T>> {
    const token = await bearer(auth);
    const headers: Record<string, string> = {
      Accept: request.accept ?? 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'User-Agent': GITHUB_USER_AGENT,
      Authorization: `Bearer ${token}`,
    };
    if (request.body !== undefined) headers['Content-Type'] = 'application/json';
    const { response, text } = await callGitHub(
      options.fetch,
      buildUrl(options.apiUrl, request, extraQuery),
      { method: request.method ?? 'GET', headers, body: request.body === undefined ? undefined : JSON.stringify(request.body) },
      timeoutMs,
    );
    let data: unknown = null;
    if (response.status !== 204 && text.trim() !== '') {
      try {
        data = JSON.parse(text);
      } catch {
        throw new GitHubError({ kind: 'unavailable', status: response.status, message: 'GitHub answered with invalid JSON' });
      }
    }
    return { status: response.status, data: data as T, rateLimit: readRateLimit(response.headers), nextPage: readNextPage(response.headers) };
  }

  return {
    request: (auth, request) => send(auth, request),

    async paginate<T>(
      auth: GitHubAuth,
      request: GitHubRequest & { readonly maxPages: number; readonly startPage?: number; readonly itemsKey?: string },
    ) {
      const items: T[] = [];
      let page = request.startPage ?? 1;
      let calls = 0;
      let nextPage: number | null = null;
      let rateLimit: GitHubRateLimit = { limit: null, remaining: null, resetAt: null };
      while (calls < request.maxPages) {
        const response = await send<unknown>(auth, request, { per_page: request.query?.per_page ?? GITHUB_LIMITS.perPage, page });
        calls += 1;
        rateLimit = response.rateLimit;
        const list: unknown = request.itemsKey
          ? (response.data as Record<string, unknown> | null)?.[request.itemsKey]
          : response.data;
        if (!Array.isArray(list)) throw new GitHubError({ kind: 'unavailable', status: response.status, message: 'GitHub answered with an unexpected list' });
        items.push(...(list as T[]));
        nextPage = response.nextPage;
        if (nextPage === null) break;
        page = nextPage;
      }
      return { items, nextPage, calls, rateLimit };
    },
  };
}
