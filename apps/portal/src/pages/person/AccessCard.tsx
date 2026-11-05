import { useEffect, useState } from 'react';
import { Alert, Button, Card, ProblemAlert, SelectField } from '../../components/ui.tsx';
import { api, invalidate, lookups, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import type { Department, Grant, PersonDetail, RolesResponse } from '../../lib/types.ts';

export function AccessCard({
  person,
  grants,
  departments,
  onChanged,
}: {
  person: PersonDetail;
  grants: Grant[];
  departments: Department[] | undefined;
  onChanged: () => void;
}) {
  const [roles, setRoles] = useState<RolesResponse>();
  const [roleId, setRoleId] = useState(person.accessRoleId);
  const [rows, setRows] = useState<Grant[]>(grants);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void lookups.roles().then(setRoles, (err: unknown) => setProblem(problemFrom(err)));
  }, []);

  const catalogue = roles ? (Object.entries(roles.catalogue) as Array<[string, string]>) : [];
  const update = (i: number, patch: Partial<Grant>) => setRows(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const closeReview = async (reviewId: string) => {
    setProblem(null);
    try {
      await api('/api/access-reviews/:id/review', { method: 'POST', params: { id: reviewId } });
      onChanged();
    } catch (err) {
      setProblem(problemFrom(err));
    }
  };

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setProblem(null);
    try {
      await api('/api/people/:id/access', { method: 'PUT', params: { id: person.id }, body: { accessRoleId: roleId, grants: rows } });
      invalidate('roles');
      setSaved(true);
      onChanged();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Access" description="The access role decides what someone can do. Extra grants add single permissions, everywhere or for one department.">
      <div className="stack">
        <SelectField label="Access role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          {roles?.roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectField>
        <fieldset className="stack-sm">
          <legend className="label">Extra grants</legend>
          {rows.length === 0 && <p className="muted">None. They have exactly what their role gives.</p>}
          {rows.map((row, i) => (
            <div className="grant-row" key={i}>
              <SelectField label="Permission" value={row.permission} onChange={(e) => update(i, { permission: e.target.value })}>
                {catalogue.map(([key, description]) => (
                  <option key={key} value={key}>
                    {description}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Where" value={row.departmentId ?? ''} onChange={(e) => update(i, { departmentId: e.target.value || null })}>
                <option value="">Every department</option>
                {departments?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </SelectField>
              <Button variant="ghost" size="sm" icon="trash" aria-label="Remove grant" onClick={() => setRows(rows.filter((_, j) => j !== i))} />
            </div>
          ))}
          {catalogue.length > 0 && (
            <div>
              <Button size="sm" icon="plus" onClick={() => setRows([...rows, { permission: catalogue[0][0], departmentId: person.departmentId }])}>
                Add grant
              </Button>
            </div>
          )}
        </fieldset>
        {person.accessReviews?.map((review) => (
          <Alert key={review.id} tone="info" title="Access review">
            <p>{review.note}</p>
            <Button size="sm" onClick={() => void closeReview(review.id)}>Mark reviewed</Button>
          </Alert>
        ))}
        <ProblemAlert problem={problem} />
        {saved && <Alert tone="success" title="Access saved." />}
        <div className="form-actions">
          <Button variant="primary" busy={busy} onClick={save} disabled={!roles}>
            Save access
          </Button>
        </div>
      </div>
    </Card>
  );
}
