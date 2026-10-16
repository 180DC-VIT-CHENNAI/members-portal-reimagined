import { type FormEvent, useEffect, useState } from 'react';
import { BackLink, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField, TextField } from '../../components/ui.tsx';
import { api, invalidate, lookups, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { useSession } from '../../lib/session.tsx';
import type { Department, Position } from '../../lib/types.ts';
import { Forbidden } from './Forbidden.tsx';

export function PositionsPage() {
  const { can } = useSession();
  const list = useLoad(() => api('/api/positions'), []);
  const [departments, setDepartments] = useState<Department[]>();
  useEffect(() => {
    void lookups.departments().then(setDepartments, () => {});
  }, []);
  if (!can('positions.manage')) return <Forbidden title="Positions" />;

  const groups: Array<{ id: string | null; name: string }> = [{ id: null, name: 'Club-wide' }, ...(departments ?? []).map((d) => ({ id: d.id, name: d.name }))];
  const changed = () => {
    invalidate('positions');
    list.reload();
  };

  return (
    <div className="page">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader overline="Organisation" title="Positions" lede="Titles people hold in a term. Lower rank sorts first. Positions never grant access." />
      <div className="stack">
        <NewPosition groups={groups.filter((g) => can('positions.manage', g.id))} onCreated={changed} />
        {list.problem ? (
          <ErrorState problem={list.problem} onRetry={list.reload} />
        ) : !list.data ? (
          <LoadingBlock />
        ) : (
          groups.map((g) => {
            const items = list.data!.filter((p) => p.departmentId === g.id);
            return (
              <Card key={g.id ?? 'club'} title={g.name} flush>
                {items.length === 0 ? (
                  <EmptyState icon="briefcase" title="No positions" />
                ) : (
                  <div className="table-wrap">
                    <table className="table table-stack">
                      <thead>
                        <tr>
                          <th scope="col">Title</th>
                          <th scope="col" className="num">
                            Rank
                          </th>
                          <th scope="col">Status</th>
                          <th scope="col">
                            <span className="visually-hidden">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((p) => (
                          <PositionRow key={p.id} position={p} editable={can('positions.manage', g.id)} onChanged={changed} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function PositionRow({ position, editable, onChanged }: { position: Position; editable: boolean; onChanged: () => void }) {
  const [title, setTitle] = useState(position.title);
  const [rank, setRank] = useState(String(position.rank));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const dirty = title.trim() !== position.title || Number(rank) !== position.rank;

  const save = async (body: { title?: string; rank?: number; active?: boolean }) => {
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/positions/:id', { method: 'PATCH', params: { id: position.id }, body });
      onChanged();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  if (!editable) {
    return (
      <tr>
        <td className="cell-primary">{position.title}</td>
        <td className="num" data-label="Rank">
          {position.rank}
        </td>
        <td data-label="Status">{position.active ? 'In use' : 'Retired'}</td>
        <td className="cell-actions" />
      </tr>
    );
  }
  return (
    <tr>
      <td className="cell-primary">
        <TextField label="Title" className="visually-hidden-label" value={title} onChange={(e) => setTitle(e.target.value)} error={problem?.message} />
      </td>
      <td data-label="Rank">
        <TextField label="Rank" type="number" min={0} max={1000} value={rank} onChange={(e) => setRank(e.target.value)} />
      </td>
      <td data-label="Status">{position.active ? <span className="badge badge-success">In use</span> : <span className="badge">Retired</span>}</td>
      <td className="cell-actions">
        <div className="cluster">
          {dirty && (
            <Button size="sm" variant="primary" busy={busy} onClick={() => save({ title: title.trim(), rank: Number(rank) })}>
              Save
            </Button>
          )}
          <Button size="sm" variant={position.active ? 'danger-quiet' : 'secondary'} disabled={busy} onClick={() => save({ active: !position.active })}>
            {position.active ? 'Retire' : 'Restore'}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function NewPosition({ groups, onCreated }: { groups: Array<{ id: string | null; name: string }>; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [departmentId, setDepartmentId] = useState(groups[0]?.id ?? '');
  const [rank, setRank] = useState('100');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  if (groups.length === 0) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/positions', { method: 'POST', body: { title, departmentId: departmentId || null, rank: Number(rank) } });
      setTitle('');
      onCreated();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="New position">
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={problem?.fields.title} required placeholder="e.g. Cloud Engineer" />
          <SelectField label="Department" value={departmentId ?? ''} onChange={(e) => setDepartmentId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id ?? ''} value={g.id ?? ''}>
                {g.name}
              </option>
            ))}
          </SelectField>
          <TextField label="Rank" type="number" min={0} max={1000} value={rank} onChange={(e) => setRank(e.target.value)} hint="Lower sorts first." />
        </div>
        <ProblemAlert problem={problem} fieldsShown={['title']} />
        <div className="form-actions">
          <Button type="submit" variant="primary" icon="plus" busy={busy} disabled={!title.trim()}>
            Add position
          </Button>
        </div>
      </form>
    </Card>
  );
}
