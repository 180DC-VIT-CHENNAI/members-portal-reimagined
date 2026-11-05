import { type FormEvent, useEffect, useState } from 'react';
import { Button, Card, ConfirmDialog, Dialog, EmptyState, ProblemAlert, SelectField } from '../../components/ui.tsx';
import { api, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDate, lookupName, today } from '../../lib/format.ts';
import { useSession } from '../../lib/session.tsx';
import type { Department, DirectoryEntry, PersonDetail, Position, Tenure, Term } from '../../lib/types.ts';

import { AddTenureForm } from './AddTenureForm.tsx';
export function TenureCard({
  person,
  positions,
  terms,
  departments,
  onChanged,
}: {
  person: PersonDetail;
  positions: Position[] | undefined;
  terms: Term[] | undefined;
  departments: Department[] | undefined;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const [adding, setAdding] = useState(false);
  const [ending, setEnding] = useState<PersonDetail['tenures'][number] | null>(null);
  const [reporting, setReporting] = useState<PersonDetail['tenures'][number] | null>(null);
  const [directory, setDirectory] = useState<DirectoryEntry[]>();
  useEffect(() => {
    if (!can('people.view')) return;
    void api('/api/people', { query: { status: 'active' } }).then(setDirectory, () => {});
  }, [can]);
  const personName = (id: string | null) => (id ? (directory?.find((d) => d.id === id)?.fullName ?? 'Someone') : null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const editable = (departmentId: string | null) => can('people.edit', departmentId ?? person.departmentId);
  const assignable = positions?.filter((p) => p.active && editable(p.departmentId)) ?? [];
  const deptName = (id: string | null) => lookupName(departments, id, (d) => d.name) ?? 'Club-wide';

  const end = async () => {
    if (!ending) return;
    setBusy(true);
    try {
      await api('/api/tenures/:id/end', { method: 'POST', params: { id: ending.id }, body: { endedOn: today() } });
      setEnding(null);
      setProblem(null);
      onChanged();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Positions and terms"
      description="Titles held in each academic year. Titles don't grant access."
      flush
      actions={
        assignable.length > 0 && (
          <Button size="sm" icon="plus" onClick={() => setAdding(true)}>
            Add position
          </Button>
        )
      }
    >
      {person.tenures.length === 0 ? (
        <EmptyState icon="briefcase" title="No positions yet" />
      ) : (
        <div className="table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th scope="col">Position</th>
                <th scope="col">Term</th>
                <th scope="col">From</th>
                <th scope="col">Until</th>
                <th scope="col">Reports to</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {person.tenures.map((t) => (
                <tr key={t.id}>
                  <td className="cell-primary">
                    {t.title}
                    <span className="caption muted"> · {deptName(t.departmentId)}</span>
                  </td>
                  <td data-label="Term">{t.termLabel}</td>
                  <td data-label="From" className="nowrap">
                    {formatDate(t.startedOn)}
                  </td>
                  <td data-label="Until" className="nowrap">
                    {t.endedOn ? formatDate(t.endedOn) : <span className="badge badge-accent">Current</span>}
                  </td>
                  <td data-label="Reports to">{personName(t.reportsToPersonId) ?? <span className="muted">No one</span>}</td>
                  <td className="cell-actions">
                    {!t.endedOn && editable(t.departmentId) && directory && (
                      <Button size="sm" variant="ghost" onClick={() => setReporting(t)}>
                        Reports to…
                      </Button>
                    )}
                    {!t.endedOn && editable(t.departmentId) && (
                      <Button size="sm" variant="danger-quiet" onClick={() => setEnding(t)}>
                        End
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={adding} title="Add a position" onClose={() => setAdding(false)}>
        {adding && (
          <AddTenureForm
            personId={person.id}
            positions={assignable}
            terms={terms}
            deptName={deptName}
            onDone={(changed) => {
              setAdding(false);
              if (changed) onChanged();
            }}
          />
        )}
      </Dialog>
      <Dialog open={reporting !== null} title="Who do they report to?" onClose={() => setReporting(null)}>
        {reporting && directory && (
          <ReportsToForm
            tenure={reporting}
            people={directory.filter((d) => d.id !== person.id)}
            onDone={(changed) => {
              setReporting(null);
              if (changed) onChanged();
            }}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={ending !== null}
        title="End this position?"
        confirmLabel="End position"
        tone="danger"
        busy={busy}
        problem={problem}
        onConfirm={end}
        onClose={() => {
          setEnding(null);
          setProblem(null);
        }}
      >
        <p>
          {person.fullName} stops holding <strong>{ending?.title}</strong> today. The record stays in their history.
        </p>
      </ConfirmDialog>
    </Card>
  );
}

function ReportsToForm({ tenure, people, onDone }: { tenure: Tenure; people: DirectoryEntry[]; onDone: (changed: boolean) => void }) {
  const [managerId, setManagerId] = useState(tenure.reportsToPersonId ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/tenures/:id', { method: 'PATCH', params: { id: tenure.id }, body: { reportsToPersonId: managerId || null } });
      onDone(true);
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };
  return (
    <form className="form" onSubmit={submit}>
      <SelectField label={`${tenure.title} reports to`} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
        <option value="">No one</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
      </SelectField>
      <ProblemAlert problem={problem} />
      <div className="form-actions">
        <Button variant="ghost" onClick={() => onDone(false)} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="primary" busy={busy}>Save</Button>
      </div>
    </form>
  );
}
