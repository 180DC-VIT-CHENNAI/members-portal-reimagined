import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createGitHubClient, errorFromResponse, GitHubError } from './client.ts';
import type { FetchLike, GhIssue, GitHubAuth, GitHubClientOptions } from './types.ts';

const tokens: GitHubClientOptions['tokens'] = {
  appJwt: async () => 'app-jwt',
  installationToken: async (id) => `inst-${id}`,
};
const USER: GitHubAuth = { kind: 'user', token: 'ghu_user' };

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function stub(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init = {}) => {
    calls.push({ url, init });
    return respond({ url, init }, calls.length - 1);
  };
  return { calls, fetch };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function client(fetch: FetchLike, timeoutMs?: number) {
  return createGitHubClient({ fetch, apiUrl: 'https://api.github.com', tokens, timeoutMs });
}

function headersOf(call: Call): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as T;
}

async function failure(promise: Promise<unknown>): Promise<GitHubError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof GitHubError, 'expected a GitHubError');
    return err;
  }
  assert.fail('expected the call to fail');
}

test('requests carry the documented headers and the credential of each auth kind', async () => {
  const { calls, fetch } = stub(() => json({}));
  const gh = client(fetch);
  await gh.request({ kind: 'app' }, { path: '/app' });
  await gh.request({ kind: 'installation', installationId: 7 }, { path: '/installation/repositories' });
  await gh.request(USER, { path: '/user' });

  assert.deepEqual(calls.map((c) => headersOf(c).Authorization), ['Bearer app-jwt', 'Bearer inst-7', 'Bearer ghu_user']);
  const first = headersOf(calls[0]!);
  assert.equal(first.Accept, 'application/vnd.github+json');
  assert.equal(first['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(first['User-Agent'], '180dc-portal');
  assert.equal(first['Content-Type'], undefined);
  assert.equal(calls[0]!.init.method, 'GET');
  assert.equal(calls[0]!.url, 'https://api.github.com/app');
});

test('JSON bodies, methods and a custom Accept are passed through', async () => {
  const { calls, fetch } = stub(() => json({ ok: true }, 201));
  const response = await client(fetch).request<{ ok: boolean }>(USER, {
    method: 'POST',
    path: '/repos/o/r/issues',
    body: { title: 'x', labels: ['a'] },
    accept: 'application/vnd.github.raw+json',
  });
  assert.equal(response.status, 201);
  assert.deepEqual(response.data, { ok: true });
  const call = calls[0]!;
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.body, JSON.stringify({ title: 'x', labels: ['a'] }));
  assert.equal(headersOf(call)['Content-Type'], 'application/json');
  assert.equal(headersOf(call).Accept, 'application/vnd.github.raw+json');
});

test('query values are encoded and undefined ones dropped', async () => {
  const { calls, fetch } = stub(() => json([]));
  await client(fetch).request(USER, {
    path: '/repos/o/r/issues',
    query: { state: 'open', labels: 'status: todo,bug', since: undefined, per_page: 100, draft: false },
  });
  const url = new URL(calls[0]!.url);
  assert.equal(url.pathname, '/repos/o/r/issues');
  assert.equal(url.searchParams.get('labels'), 'status: todo,bug');
  assert.equal(url.searchParams.get('per_page'), '100');
  assert.equal(url.searchParams.get('draft'), 'false');
  assert.equal(url.searchParams.has('since'), false);
});

test('a 204 answers data null and the fixture issue parses', async () => {
  const issue = fixture<GhIssue>('issue');
  const { fetch } = stub((call) => (call.init.method === 'DELETE' ? new Response(null, { status: 204 }) : json(issue)));
  const gh = client(fetch);
  const deleted = await gh.request(USER, { method: 'DELETE', path: '/repos/o/r/issues/42/labels/bug' });
  assert.equal(deleted.status, 204);
  assert.equal(deleted.data, null);
  const loaded = await gh.request<GhIssue>(USER, { path: '/repos/o/r/issues/42' });
  assert.equal(loaded.data.number, 42);
  assert.equal(loaded.data.labels[0]?.name, 'status: todo');
});

test('rate limit headers and the Link next page are read', async () => {
  const { fetch } = stub(() =>
    json([], 200, {
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4990',
      'x-ratelimit-reset': '1793880000',
      link: '<https://api.github.com/repositories/1/issues?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/1/issues?per_page=100&page=9>; rel="last"',
    }),
  );
  const response = await client(fetch).request(USER, { path: '/x' });
  assert.deepEqual(response.rateLimit, { limit: 5000, remaining: 4990, resetAt: new Date(1793880000 * 1000).toISOString() });
  assert.equal(response.nextPage, 2);
});

test('missing rate limit headers read as null', async () => {
  const { fetch } = stub(() => json([]));
  const response = await client(fetch).request(USER, { path: '/x' });
  assert.deepEqual(response.rateLimit, { limit: null, remaining: null, resetAt: null });
  assert.equal(response.nextPage, null);
});

test('paginate stops at maxPages, reports the next page and counts calls', async () => {
  const pages = [[1, 2], [3, 4], [5]];
  const { calls, fetch } = stub((call) => {
    const page = Number(new URL(call.url).searchParams.get('page'));
    return json(pages[page - 1], 200, page < 3 ? { link: `<https://api.github.com/x?page=${page + 1}>; rel="next"` } : {});
  });
  const gh = client(fetch);

  const first = await gh.paginate<number>(USER, { path: '/x', maxPages: 2 });
  assert.deepEqual(first.items, [1, 2, 3, 4]);
  assert.equal(first.calls, 2);
  assert.equal(first.nextPage, 3);
  assert.equal(new URL(calls[0]!.url).searchParams.get('per_page'), '100');
  assert.equal(new URL(calls[0]!.url).searchParams.get('page'), '1');

  const rest = await gh.paginate<number>(USER, { path: '/x', maxPages: 5, startPage: 3 });
  assert.deepEqual(rest.items, [5]);
  assert.equal(rest.calls, 1);
  assert.equal(rest.nextPage, null);
});

test('paginate honours a caller per_page and unwraps itemsKey lists', async () => {
  const { calls, fetch } = stub(() => json({ total_count: 2, repositories: [{ id: 1 }, { id: 2 }] }));
  const result = await client(fetch).paginate<{ id: number }>(
    { kind: 'installation', installationId: 9 },
    { path: '/installation/repositories', maxPages: 3, itemsKey: 'repositories', query: { per_page: 30 } },
  );
  assert.deepEqual(result.items.map((r) => r.id), [1, 2]);
  assert.equal(result.calls, 1);
  assert.equal(new URL(calls[0]!.url).searchParams.get('per_page'), '30');
});

test('paginate rejects a response that is not a list', async () => {
  const { fetch } = stub(() => json({ message: 'nope' }));
  const err = await failure(client(fetch).paginate(USER, { path: '/x', maxPages: 1 }));
  assert.equal(err.kind, 'unavailable');
});

test('status codes map to error kinds, including a rate-limit 403 versus a plain 403', async () => {
  const cases: readonly [number, Record<string, string>, string, string][] = [
    [401, {}, 'Bad credentials', 'unauthorized'],
    [403, { 'x-ratelimit-remaining': '0' }, 'API rate limit exceeded', 'rate_limited'],
    [403, { 'retry-after': '30' }, 'Please wait', 'rate_limited'],
    [403, {}, 'You have exceeded a secondary rate limit', 'rate_limited'],
    [403, { 'x-ratelimit-remaining': '4000' }, 'Resource not accessible by integration', 'forbidden'],
    [404, {}, 'Not Found', 'not_found'],
    [409, {}, 'Conflict', 'conflict'],
    [410, {}, 'Issues are disabled', 'gone'],
    [422, {}, 'Validation Failed', 'validation'],
    [429, {}, 'Too many requests', 'rate_limited'],
    [500, {}, 'Server Error', 'unavailable'],
    [503, {}, 'Unavailable', 'unavailable'],
  ];
  for (const [status, headers, message, kind] of cases) {
    const { fetch } = stub(() => json({ message, documentation_url: 'https://docs.github.com/x' }, status, headers));
    const err = await failure(client(fetch).request(USER, { path: '/x' }));
    assert.equal(err.kind, kind, `${status} ${message}`);
    assert.equal(err.status, status);
    assert.equal(err.message, message);
    assert.equal(err.documentationUrl, 'https://docs.github.com/x');
  }
});

test('retryAfterSeconds comes from retry-after, else from the reset time', () => {
  const nowMs = Date.parse('2026-11-05T12:00:00Z');
  const withHeaders = (status: number, headers: Record<string, string>) => errorFromResponse(new Response('{}', { status, headers }), '{}', nowMs);

  assert.equal(withHeaders(403, { 'retry-after': '42' }).retryAfterSeconds, 42);
  assert.equal(withHeaders(429, { 'x-ratelimit-reset': String(nowMs / 1000 + 90) }).retryAfterSeconds, 90);
  assert.equal(withHeaders(429, { 'x-ratelimit-reset': String(nowMs / 1000 - 10) }).retryAfterSeconds, 0);
  assert.equal(withHeaders(429, { 'retry-after': '5', 'x-ratelimit-reset': String(nowMs / 1000 + 90) }).retryAfterSeconds, 5);
  assert.equal(withHeaders(404, {}).retryAfterSeconds, null);
  assert.equal(withHeaders(500, { 'retry-after': '7' }).retryAfterSeconds, 7);
});

test('a non-JSON error body becomes the message', () => {
  const err = errorFromResponse(new Response('upstream exploded', { status: 502 }), 'upstream exploded');
  assert.equal(err.kind, 'unavailable');
  assert.equal(err.message, 'upstream exploded');
  assert.equal(errorFromResponse(new Response('', { status: 500 }), '').message, 'GitHub answered 500');
});

test('a thrown fetch is a network error and an aborted one a timeout', async () => {
  const broken = stub(() => {
    throw new TypeError('connection refused to api.github.com');
  });
  const network = await failure(client(broken.fetch).request(USER, { path: '/x' }));
  assert.equal(network.kind, 'network');
  assert.equal(network.status, null);

  const hanging: FetchLike = (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });
  const timeout = await failure(client(hanging, 5).request(USER, { path: '/x' }));
  assert.equal(timeout.kind, 'timeout');
});

test('a 200 with invalid JSON is reported as unavailable', async () => {
  const { fetch } = stub(() => new Response('<html>', { status: 200 }));
  const err = await failure(client(fetch).request(USER, { path: '/x' }));
  assert.equal(err.kind, 'unavailable');
});

test('a failing token source stops the request before any HTTP call', async () => {
  const { calls, fetch } = stub(() => json({}));
  const gh = createGitHubClient({
    fetch,
    apiUrl: 'https://api.github.com',
    tokens: { appJwt: async () => 'x', installationToken: async () => Promise.reject(new GitHubError({ kind: 'forbidden', message: 'denied' })) },
  });
  const err = await failure(gh.request({ kind: 'installation', installationId: 1 }, { path: '/x' }));
  assert.equal(err.kind, 'forbidden');
  assert.equal(calls.length, 0);
});
