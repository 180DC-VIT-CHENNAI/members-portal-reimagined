import { useCallback, useState } from 'react';
import { problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';

export type ActionResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: ApiProblem };

export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const run = useCallback(async <T>(key: string, action: () => Promise<T>): Promise<ActionResult<T>> => {
    setBusy(key);
    setProblem(null);
    try {
      return { ok: true, value: await action() };
    } catch (err) {
      const failed = problemFrom(err);
      setProblem(failed);
      return { ok: false, problem: failed };
    } finally {
      setBusy(null);
    }
  }, []);

  return { busy, problem, setProblem, run };
}
