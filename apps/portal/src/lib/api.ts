import { useCallback, useEffect, useState } from 'react';
import { fetch } from 'void/client';
import { type ApiProblem, toProblem } from './errors.ts';

export const api = fetch;

/**
 * Multipart POST for file uploads (the typed client only sends JSON). Errors
 * are thrown in the typed client's `{ status, data }` shape so `problemFrom`
 * maps them the same way.
 */
export async function upload<T>(path: string, form: FormData): Promise<T> {
  let res: Response;
  try {
    res = await globalThis.fetch(path, { method: 'POST', body: form, credentials: 'same-origin', headers: { accept: 'application/json' } });
  } catch {
    throw { status: null };
  }
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok) throw { status: res.status, data };
  return data as T;
}

let handleUnauthorized = () => {};

export function onUnauthorized(handler: () => void) {
  handleUnauthorized = handler;
}

export function problemFrom(err: unknown): ApiProblem {
  const problem = toProblem(err);
  if (problem.status === 401) handleUnauthorized();
  return problem;
}

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let hit = cache.get(key) as Promise<T> | undefined;
  if (!hit) {
    hit = load();
    cache.set(key, hit);
    hit.catch(() => cache.delete(key));
  }
  return hit;
}

export function invalidate(...keys: Array<keyof typeof lookups>) {
  for (const key of keys) cache.delete(key);
}

export function clearCache() {
  cache.clear();
}

export const lookups = {
  departments: () => cached('departments', () => api('/api/departments')),
  positions: () => cached('positions', () => api('/api/positions')),
  terms: () => cached('terms', () => api('/api/terms')),
  roles: () => cached('roles', () => api('/api/access-roles')),
};

export interface Loaded<T> {
  data: T | undefined;
  problem: ApiProblem | undefined;
  loading: boolean;
  reload: () => void;
  setData: (data: T) => void;
}

export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const [state, setState] = useState<{ data?: T; problem?: ApiProblem; loading: boolean }>({ loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    setState((prev) => ({ data: prev.data, loading: true }));
    load().then(
      (data) => {
        if (live) setState({ data, loading: false });
      },
      (err: unknown) => {
        if (live) setState({ problem: problemFrom(err), loading: false });
      },
    );
    return () => {
      live = false;
    };
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((data: T) => setState({ data, loading: false }), []);
  return { data: state.data, problem: state.problem, loading: state.loading, reload, setData };
}
