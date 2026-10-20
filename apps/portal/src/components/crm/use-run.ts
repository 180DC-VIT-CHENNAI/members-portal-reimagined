import { useState } from 'react';
import { problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';

/** One busy flag and problem for a panel's actions; `after` runs only when the action succeeded. */
export function useRun() {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const run = async (key: string, action: () => Promise<unknown>, after?: () => void) => {
    setBusy(key);
    setProblem(null);
    try {
      await action();
      after?.();
      return true;
    } catch (err) {
      setProblem(problemFrom(err));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, problem, setProblem, run };
}
