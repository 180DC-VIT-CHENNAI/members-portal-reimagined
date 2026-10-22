import { type FormEvent, useState } from 'react';
import { Button, ProblemAlert, SelectField, TextField } from '../../components/ui.tsx';
import { api, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { today } from '../../lib/format.ts';
import type { Position, Term } from '../../lib/types.ts';

export function AddTenureForm({
  personId,
  positions,
  terms,
  deptName,
  onDone,
}: {
  personId: string;
  positions: Position[];
  terms: Term[] | undefined;
  deptName: (id: string | null) => string;
  onDone: (changed: boolean) => void;
}) {
  const currentTerm = terms?.find((t) => t.isCurrent);
  const [positionId, setPositionId] = useState(positions[0]?.id ?? '');
  const [termId, setTermId] = useState(currentTerm?.id ?? '');
  const [startedOn, setStartedOn] = useState(today());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/people/:id/tenures', { method: 'POST', params: { id: personId }, body: { positionId, termId: termId || undefined, startedOn } });
      onDone(true);
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <SelectField label="Position" value={positionId} onChange={(e) => setPositionId(e.target.value)} error={problem?.fields.positionId}>
        {positions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title} ({deptName(p.departmentId)})
          </option>
        ))}
      </SelectField>
      <SelectField label="Term" value={termId} onChange={(e) => setTermId(e.target.value)}>
        {terms?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
            {t.isCurrent ? ' (current)' : ''}
          </option>
        ))}
      </SelectField>
      <TextField label="Starting" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} error={problem?.fields.startedOn} />
      <ProblemAlert problem={problem} fieldsShown={['positionId', 'startedOn']} />
      <div className="form-actions">
        <Button variant="ghost" onClick={() => onDone(false)} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={busy} disabled={!positionId}>
          Add position
        </Button>
      </div>
    </form>
  );
}
