import { type FormEvent, useState } from 'react';
import { Button, Card, Dialog, ErrorState, ProblemAlert, SelectField, TextAreaField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDate } from '../../lib/format.ts';
import { useSession } from '../../lib/session.tsx';
import type { PersonDetail, Position, Term } from '../../lib/types.ts';

const STATUS_BADGE = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-error', withdrawn: '' } as const;

export function PromotionsCard({ person, positions, terms, onChanged }: { person: PersonDetail; positions: Position[] | undefined; terms: Term[] | undefined; onChanged: () => void }) {
  const session = useSession();
  const self = person.id === session.me.id;
  const proposals = useLoad(() => api('/api/promotions', { query: { person: person.id } }), [person.id]);
  const [proposing, setProposing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const proposable = self ? [] : (positions?.filter((p) => p.active && session.can('people.edit', p.departmentId ?? person.departmentId)) ?? []);
  if (!proposals.data?.length && proposable.length === 0 && !proposals.problem) return null;

  const decide = async (id: string, action: 'approve' | 'reject' | 'withdraw') => {
    setBusy(`${id}:${action}`);
    setProblem(null);
    try {
      await api('/api/promotions/:id/decision', { method: 'POST', params: { id }, body: { action } });
      proposals.reload();
      if (action === 'approve') onChanged();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title="Promotions"
      description="A proposed position needs a second person's approval. Approval adds the position only; access is reviewed separately."
      actions={proposable.length > 0 && <Button size="sm" icon="plus" onClick={() => setProposing(true)}>Propose</Button>}
    >
      {proposals.problem && <ErrorState problem={proposals.problem} onRetry={proposals.reload} />}
      {proposals.data?.length === 0 && <p className="muted">No proposals yet.</p>}
      <ul className="stack">
        {proposals.data?.map((p) => (
          <li key={p.id} className="stack-sm">
            <div className="row-between">
              <strong>{p.positionTitle} · {p.termLabel}</strong>
              <span className={`badge ${STATUS_BADGE[p.status]}`}>{p.status}</span>
            </div>
            <p className="caption muted">Proposed by {p.proposedByName} on {formatDate(p.createdAt.slice(0, 10))}; starts {formatDate(p.startsOn)}</p>
            <p>{p.rationale}</p>
            {p.decisionNote && <p className="caption">Decision note: {p.decisionNote}</p>}
            {(p.canDecide || p.canWithdraw) && (
              <div className="cluster">
                {p.canDecide && <Button size="sm" variant="primary" busy={busy === `${p.id}:approve`} onClick={() => void decide(p.id, 'approve')}>Approve</Button>}
                {p.canDecide && <Button size="sm" variant="danger-quiet" busy={busy === `${p.id}:reject`} onClick={() => void decide(p.id, 'reject')}>Reject</Button>}
                {p.canWithdraw && <Button size="sm" variant="ghost" busy={busy === `${p.id}:withdraw`} onClick={() => void decide(p.id, 'withdraw')}>Withdraw</Button>}
              </div>
            )}
          </li>
        ))}
      </ul>
      <ProblemAlert problem={problem} />
      <Dialog open={proposing} title={`Propose a position for ${person.fullName}`} onClose={() => setProposing(false)}>
        {proposing && (
          <ProposeForm
            personId={person.id}
            positions={proposable}
            terms={terms}
            onDone={(changed) => {
              setProposing(false);
              if (changed) proposals.reload();
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function ProposeForm({ personId, positions, terms, onDone }: { personId: string; positions: Position[]; terms: Term[] | undefined; onDone: (changed: boolean) => void }) {
  const [positionId, setPositionId] = useState(positions[0]?.id ?? '');
  const [termId, setTermId] = useState(terms?.find((t) => t.isCurrent)?.id ?? '');
  const [rationale, setRationale] = useState('');
  const [letterDocumentId, setLetterDocumentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/promotions', {
        method: 'POST',
        body: { personId, positionId, termId: termId || undefined, rationale, letterDocumentId: letterDocumentId.trim() || null },
      });
      onDone(true);
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <SelectField label="Position" value={positionId} onChange={(e) => setPositionId(e.target.value)}>
        {positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
      </SelectField>
      <SelectField label="Term" value={termId} onChange={(e) => setTermId(e.target.value)}>
        {terms?.map((t) => <option key={t.id} value={t.id}>{t.label}{t.isCurrent ? ' (current)' : ''}</option>)}
      </SelectField>
      <TextAreaField label="Why" rows={3} maxLength={2000} value={rationale} onChange={(e) => setRationale(e.target.value)} required error={problem?.fields.rationale} />
      <TextField label="Letter Studio document ID" optional hint="Link the appointment letter if one was issued." value={letterDocumentId} onChange={(e) => setLetterDocumentId(e.target.value)} />
      <ProblemAlert problem={problem} fieldsShown={['rationale']} />
      <div className="form-actions">
        <Button variant="ghost" onClick={() => onDone(false)} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="primary" busy={busy} disabled={!positionId || !rationale.trim()}>Propose</Button>
      </div>
    </form>
  );
}
