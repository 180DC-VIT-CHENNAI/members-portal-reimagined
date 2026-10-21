import { type FormEvent, useState } from 'react';
import { Button, Card, Dialog, ProblemAlert, SelectField, TextField } from '../../components/ui.tsx';
import { api, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDate, today } from '../../lib/format.ts';
import { useSession } from '../../lib/session.tsx';
import type { Department, PersonDetail } from '../../lib/types.ts';

export function MembershipsCard({ person, departments, onChanged }: { person: PersonDetail; departments: Department[] | undefined; onChanged: () => void }) {
  const { can } = useSession();
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const addable = departments?.filter((d) => d.active && d.id !== person.departmentId && can('people.edit', d.id)) ?? [];
  if (person.memberships.length === 0 && addable.length === 0) return null;
  const current = (until: string | null) => !until || until >= today();

  const end = async (membershipId: string) => {
    setProblem(null);
    try {
      await api('/api/people/:id/memberships/:membershipId', { method: 'DELETE', params: { id: person.id, membershipId } });
      onChanged();
    } catch (err) {
      setProblem(problemFrom(err));
    }
  };

  return (
    <Card
      title="Other departments"
      description="Secondary memberships list someone under another department. Department permissions still come from their primary department."
      actions={addable.length > 0 && <Button size="sm" icon="plus" onClick={() => setAdding(true)}>Add department</Button>}
    >
      {person.memberships.length === 0 ? (
        <p className="muted">Only their primary department.</p>
      ) : (
        <ul className="stack-sm">
          {person.memberships.map((m) => (
            <li key={m.id} className="row-between">
              <span>
                <strong>{m.departmentName}</strong>
                {m.note && <span className="muted"> · {m.note}</span>}
                <span className="caption muted"> · {formatDate(m.validFrom)} – {m.validUntil ? formatDate(m.validUntil) : 'now'}</span>
              </span>
              {current(m.validUntil) && can('people.edit', m.departmentId) && (
                <Button size="sm" variant="danger-quiet" onClick={() => void end(m.id)}>End</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ProblemAlert problem={problem} />
      <Dialog open={adding} title="Add a department" onClose={() => setAdding(false)}>
        {adding && <AddMembership personId={person.id} departments={addable} onDone={(changed) => { setAdding(false); if (changed) onChanged(); }} />}
      </Dialog>
    </Card>
  );
}

function AddMembership({ personId, departments, onDone }: { personId: string; departments: Department[]; onDone: (changed: boolean) => void }) {
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [validFrom, setValidFrom] = useState(today());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/people/:id/memberships', { method: 'POST', params: { id: personId }, body: { departmentId, note: note.trim() || null, validFrom } });
      onDone(true);
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <SelectField label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </SelectField>
      <TextField label="Role in that department" optional value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Design support" />
      <TextField label="From" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
      <ProblemAlert problem={problem} />
      <div className="form-actions">
        <Button variant="ghost" onClick={() => onDone(false)} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="primary" busy={busy} disabled={!departmentId}>Add</Button>
      </div>
    </form>
  );
}
