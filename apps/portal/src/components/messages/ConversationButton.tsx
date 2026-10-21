import { useState } from 'react';
import { problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { openChannel, openDirect } from '../../lib/message-client.ts';
import { Button, ProblemAlert } from '../ui.tsx';

type Target = { readonly personId: string } | { readonly departmentId: string } | { readonly projectId: string };

export function ConversationButton({ target }: { readonly target: Target }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const open = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if ('personId' in target) await openDirect(target.personId);
      else await openChannel(target);
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Button size="sm" icon="messageSquare" busy={busy} onClick={open}>
        {'personId' in target ? 'Message' : 'Open channel'}
      </Button>
      <ProblemAlert problem={problem} />
    </div>
  );
}
