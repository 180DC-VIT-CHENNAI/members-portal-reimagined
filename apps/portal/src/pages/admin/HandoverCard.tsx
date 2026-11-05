import { type FormEvent, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, ProblemAlert, SelectField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import type { Term } from '../../lib/types.ts';
import { useSession } from '../../lib/session.tsx';

export function HandoverCard({ terms }: { terms: Term[] }) {
  const { can } = useSession();
  const manager = can('terms.manage');
  const [termId, setTermId] = useState(terms.find((t) => t.isCurrent)?.id ?? terms[0]?.id ?? '');
  const checklist = useLoad(() => api('/api/terms/:id/handover', { params: { id: termId } }), [termId]);
  const people = useLoad(() => manager ? api('/api/people', { query: { status: 'active' } }) : Promise.resolve([]), [manager]);
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setProblem(null);
    try {
      await action();
      checklist.reload();
      return true;
    } catch (err) {
      setProblem(problemFrom(err));
      return false;
    }
  };
  const add = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const saved = await run(() => api('/api/terms/:id/handover', { method: 'POST', params: { id: termId }, body: { title, ownerPersonId: ownerId || null } }));
    if (saved) setTitle('');
    setBusy(false);
  };

  return (
    <Card title="Board handover" description="What the incoming board must take over for a term, who owns each item and what is done.">
      <SelectField label="Term" value={termId} onChange={(e) => setTermId(e.target.value)}>
        {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </SelectField>
      {checklist.problem ? (
        <ErrorState problem={checklist.problem} onRetry={checklist.reload} />
      ) : !checklist.data ? (
        <LoadingBlock rows={2} />
      ) : checklist.data.items.length === 0 ? (
        <EmptyState icon="checkCircle" title="No handover items yet" />
      ) : (
        <ul className="stack-sm">
          {checklist.data.items.map((item) => (
            <li key={item.id} className="row-between">
              <label className="cluster">
                <input type="checkbox" checked={item.done} onChange={() => void run(() => api('/api/handover-items/:id', { method: 'PATCH', params: { id: item.id }, body: { done: !item.done } }))} />
                <span>{item.title}{item.ownerName && <span className="muted"> · {item.ownerName}</span>}</span>
              </label>
              {manager && <Button size="sm" variant="ghost" icon="trash" aria-label={`Remove ${item.title}`} onClick={() => void run(() => api('/api/handover-items/:id', { method: 'DELETE', params: { id: item.id } }))} />}
            </li>
          ))}
        </ul>
      )}
      {manager && <form className="form" onSubmit={add}>
        <div className="form-grid">
          <TextField label="New item" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bank signatories updated" />
          <SelectField label="Owner" optional value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">No one yet</option>
            {people.data?.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </SelectField>
        </div>
        <ProblemAlert problem={problem} />
        <div className="form-actions">
          <Button type="submit" icon="plus" busy={busy} disabled={!title.trim() || !termId}>Add item</Button>
        </div>
      </form>}
    </Card>
  );
}
