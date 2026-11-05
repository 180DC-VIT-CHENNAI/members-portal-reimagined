import { type FormEvent, useState } from 'react';
import {
  Alert,
  Avatar,
  BackLink,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  ProblemAlert,
  SelectField,
  TextField,
} from '../../components/ui.tsx';
import { api, invalidate, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDate, plural } from '../../lib/format.ts';
import { useSession } from '../../lib/session.tsx';
import type { DirectoryEntry, Term, TermStartResponse } from '../../lib/types.ts';
import { Forbidden } from './Forbidden.tsx';
import { HandoverCard } from './HandoverCard.tsx';

export function TermsPage() {
  const { can } = useSession();
  const terms = useLoad(() => api('/api/terms'), []);
  if (!can('terms.manage')) return <Forbidden title="Terms" />;
  const changed = () => {
    invalidate('terms');
    terms.reload();
  };
  const upcoming = terms.data?.filter((t) => !t.isCurrent && t.startsOn > (terms.data?.find((c) => c.isCurrent)?.startsOn ?? '')) ?? [];

  return (
    <div className="page">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader overline="Organisation" title="Terms" lede="Academic years. Starting a new term closes this year's positions and carries over the people you choose." />
      <div className="stack">
        <Card title="All terms" flush>
          {terms.problem ? (
            <ErrorState problem={terms.problem} onRetry={terms.reload} />
          ) : !terms.data ? (
            <LoadingBlock rows={3} />
          ) : terms.data.length === 0 ? (
            <EmptyState icon="calendar" title="No terms yet" />
          ) : (
            <div className="table-wrap">
              <table className="table table-stack">
                <thead>
                  <tr>
                    <th scope="col">Term</th>
                    <th scope="col">Starts</th>
                    <th scope="col">Ends</th>
                    <th scope="col">
                      <span className="visually-hidden">Status</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {terms.data.map((t) => (
                    <tr key={t.id}>
                      <td className="cell-primary">{t.label}</td>
                      <td data-label="Starts">{formatDate(t.startsOn)}</td>
                      <td data-label="Ends">{formatDate(t.endsOn)}</td>
                      <td>{t.isCurrent && <span className="badge badge-accent">Current</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <NewTerm onCreated={changed} />
        {terms.data && <StartTerm terms={upcoming} onStarted={changed} />}
        {terms.data && terms.data.length > 0 && <HandoverCard terms={terms.data} />}
      </div>
    </div>
  );
}

function NewTerm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ id: '', label: '', startsOn: '', endsOn: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/terms', { method: 'POST', body: { id: form.id.trim(), label: form.label.trim() || undefined, startsOn: form.startsOn, endsOn: form.endsOn } });
      setForm({ id: '', label: '', startsOn: '', endsOn: '' });
      onCreated();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Add a term">
      <form className="form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <TextField label="ID" value={form.id} onChange={set('id')} placeholder="2027-28" error={problem?.fields.id} required />
          <TextField label="Label" optional value={form.label} onChange={set('label')} placeholder="2027-28" />
          <TextField label="Starts" type="date" value={form.startsOn} onChange={set('startsOn')} error={problem?.fields.startsOn} required />
          <TextField label="Ends" type="date" value={form.endsOn} onChange={set('endsOn')} error={problem?.fields.endsOn} required />
        </div>
        <ProblemAlert problem={problem} fieldsShown={['id', 'startsOn', 'endsOn']} />
        <div className="form-actions">
          <Button type="submit" variant="primary" icon="plus" busy={busy}>
            Add term
          </Button>
        </div>
      </form>
    </Card>
  );
}

type Decision = 'carry' | 'end' | 'alumni';
const DECISIONS: Array<{ value: Decision; label: string }> = [
  { value: 'carry', label: 'Continue' },
  { value: 'end', label: 'No position' },
  { value: 'alumni', label: 'Alumni' },
];

function StartTerm({ terms, onStarted }: { terms: Term[]; onStarted: () => void }) {
  const [termId, setTermId] = useState(terms[0]?.id ?? '');
  const people = useLoad(async () => {
    const [active, onLeave] = await Promise.all([api('/api/people', { query: { status: 'active' } }), api('/api/people', { query: { status: 'on_leave' } })]);
    return [...active, ...onLeave].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, []);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [result, setResult] = useState<TermStartResponse | null>(null);

  if (terms.length === 0 && !result) {
    return (
      <Card title="Start a new term">
        <p className="muted">Add the next term above first.</p>
      </Card>
    );
  }
  const decisionFor = (p: DirectoryEntry): Decision => decisions[p.id] ?? (p.positions.length ? 'carry' : 'end');
  const list = people.data ?? [];
  const carryOver = list.filter((p) => decisionFor(p) === 'carry').map((p) => p.id);
  const alumni = list.filter((p) => decisionFor(p) === 'alumni').map((p) => p.id);

  const start = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await api('/api/terms/:id/start', { method: 'POST', params: { id: termId }, body: { carryOver, alumni } });
      setResult(res);
      setConfirming(false);
      onStarted();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Start a new term"
      description="Choose what happens to each current member. Everyone's open positions in this term end the day before the new one starts."
      flush
    >
      {result && (
        <Alert tone="success" title={`Term ${result.current} is now current.`}>
          {plural(result.carriedOver, 'person', 'people')} kept their positions.
        </Alert>
      )}
      {terms.length > 0 && (
        <>
          <div className="filters">
            <SelectField label="New term" value={termId} onChange={(e) => setTermId(e.target.value)}>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} (from {formatDate(t.startsOn)})
                </option>
              ))}
            </SelectField>
          </div>
          {people.problem ? (
            <ErrorState problem={people.problem} onRetry={people.reload} />
          ) : !people.data ? (
            <LoadingBlock />
          ) : (
            <ul className="decision-list">
              {list.map((p) => (
                <li key={p.id} className="decision-row">
                  <div className="person-cell">
                    <Avatar name={p.fullName} photo={p.photoKey} size={32} />
                    <div className="person-cell-text">
                      <strong>{p.fullName}</strong>
                      <span className="email">{p.positions.map((t) => t.title).join(', ') || 'No position this term'}</span>
                    </div>
                  </div>
                  <div className="segmented" role="radiogroup" aria-label={`Next term for ${p.fullName}`}>
                    {DECISIONS.map((d) => (
                      <label key={d.value}>
                        <input
                          type="radio"
                          name={`decision-${p.id}`}
                          value={d.value}
                          checked={decisionFor(p) === d.value}
                          disabled={d.value === 'carry' && p.positions.length === 0}
                          onChange={() => setDecisions({ ...decisions, [p.id]: d.value })}
                        />
                        <span className={d.value === 'alumni' ? 'seg-danger' : undefined}>{d.label}</span>
                      </label>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="card-foot">
            <p className="caption muted">
              {plural(carryOver.length, 'person', 'people')} continue · {plural(alumni.length, 'person', 'people')} become alumni
            </p>
            <Button variant="primary" disabled={!termId || !people.data} onClick={() => setConfirming(true)}>
              Start term
            </Button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirming}
        title={`Start ${termId}?`}
        confirmLabel="Start term"
        tone={alumni.length ? 'danger' : 'primary'}
        busy={busy}
        problem={problem}
        onConfirm={start}
        onClose={() => setConfirming(false)}
      >
        <ul className="summary-points">
          <li>{termId} becomes the current term.</li>
          <li>Every open position in the current term ends.</li>
          <li>{plural(carryOver.length, 'person', 'people')} keep the same positions in the new term.</li>
          {alumni.length > 0 && <li>{plural(alumni.length, 'person', 'people')} move to alumni and lose access straight away.</li>}
        </ul>
      </ConfirmDialog>
    </Card>
  );
}
