import { useState } from 'react';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, ProblemAlert, TextAreaField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';

const reasons: Readonly<Record<string, string>> = {
  unparseable: 'Could not be parsed', oversized: 'Too large to parse safely',
  dangerous_attachment: 'Attachment type not allowed', too_many_attachments: 'Too many attachments',
};

export function QuarantineCard({ id }: { readonly id: string }) {
  const load = useLoad(() => api('/api/mailboxes/:id/quarantine', { params: { id } }), [id]);
  const [headers, setHeaders] = useState<{ id: string; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setProblem(null);
    try { await action(); load.reload(); setDeleting(null); } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  const inspect = (messageId: string) => run(async () => {
    const result = await api('/api/mailboxes/:id/quarantine/:messageId', { params: { id, messageId } });
    setHeaders({ id: messageId, text: result.headers });
  });
  return <Card title="Quarantine" description="Messages held for review. Raw headers are shown as text only. Releasing places the message in the inbox; blocked attachments stay blocked.">
    <ProblemAlert problem={problem} />
    {load.problem ? <ErrorState problem={load.problem} onRetry={load.reload} /> : !load.data ? <LoadingBlock rows={2} /> :
      load.data.messages.length === 0 ? <EmptyState icon="checkCircle" title="Nothing held">Unparseable or unsafe mail would wait here for review.</EmptyState> :
        <ul className="stack">{load.data.messages.map((m) => <li key={m.id}>
          <strong>{m.subject}</strong>
          <p className="muted">{m.from.address || 'Unknown sender'} · {reasons[m.reason ?? ''] ?? m.reason} · {Math.ceil(m.size / 1024)} KiB</p>
          <div className="cluster">
            <Button size="sm" busy={busy} onClick={() => inspect(m.id)}>View headers</Button>
            <Button size="sm" busy={busy} onClick={() => run(() => api('/api/mailboxes/:id/quarantine/:messageId/release', { method: 'POST', params: { id, messageId: m.id }, body: {} }))}>Release to inbox</Button>
            <Button size="sm" variant="danger-quiet" busy={busy} onClick={() => setDeleting(m.id)}>Delete</Button>
          </div>
          {headers?.id === m.id && <TextAreaField label="Raw headers" value={headers.text} readOnly rows={8} />}
        </li>)}</ul>}
    <ConfirmDialog open={deleting !== null} title="Delete this held message?" confirmLabel="Delete permanently" tone="danger" busy={busy} problem={problem}
      onClose={() => setDeleting(null)} onConfirm={() => deleting && run(() => api('/api/mailboxes/:id/quarantine/:messageId', { method: 'DELETE', params: { id, messageId: deleting } }))}>
      The original message and its attachments are removed from storage. This cannot be undone.
    </ConfirmDialog>
  </Card>;
}
