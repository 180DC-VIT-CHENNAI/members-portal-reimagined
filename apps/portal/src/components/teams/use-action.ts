import { useState } from 'react';
import { problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';

/**
 * Runs one write at a time for a panel: tracks which action is busy and the
 * last problem, and calls `onDone` after a success. Resolves to whether it worked.
 */
export function useAction(onDone: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const run = async (key: string, action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(key);
    setProblem(null);
    try {
      await action();
      onDone();
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
