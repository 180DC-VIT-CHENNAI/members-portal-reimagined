import { type FormEvent, useState } from 'react';
import { Avatar, Button, Card, EmptyState, ProblemAlert, SelectField, StatusBadge, TextField } from '../ui.tsx';
import { api, lookups, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { isStatus } from '../../lib/format.ts';
import type { Candidate, Project } from '../../lib/project-client.ts';
import { Link } from '../../lib/router.tsx';

export function ProjectMembers({ project, candidates, onChange }: { project: Project; candidates: Candidate[]; onChange: () => void }) {
  const manage = project.access.manageMembers;
  const departments = useLoad(() => lookups.departments(), []);
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const departmentName = (departmentId: string | null) => departments.data?.find((d) => d.id === departmentId)?.name;

  const run = async (key: string, action: () => Promise<unknown>, after?: () => void) => {
    setBusy(key);
    setProblem(null);
    try {
      await action();
      after?.();
      onChange();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(null);
    }
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    void run(
      'add',
      () => api('/api/projects/:id/members', { method: 'POST', params: { id: project.id }, body: { personId, role } }),
      () => {
        setPersonId('');
        setRole('');
      },
    );
  };

  return (
    <Card title="People" description="Who is on the project and their role. Naming someone lets them see the project even outside its departments.">
      <div className="stack">
        {manage && (
          <form className="form" onSubmit={add}>
            <div className="form-grid">
              <SelectField label="Person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">Choose someone</option>
                {candidates
                  .filter((c) => !c.member)
                  .map((c) => {
                    const department = departmentName(c.departmentId);
                    return (
                      <option key={c.id} value={c.id}>
                        {department ? `${c.fullName} (${department})` : c.fullName}
                      </option>
                    );
                  })}
              </SelectField>
              <TextField
                label="Role on the project"
                placeholder="e.g. Project lead"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                error={problem?.fields.role}
                required
                maxLength={80}
              />
            </div>
            <div className="form-actions">
              <Button type="submit" variant="primary" icon="userPlus" busy={busy === 'add'} disabled={!personId || !role.trim()}>
                Add to project
              </Button>
            </div>
          </form>
        )}
        <ProblemAlert problem={problem} fieldsShown={['role']} />
        {project.members.length === 0 ? (
          <EmptyState icon="users" title="Nobody named yet">
            {manage ? 'Add the people working on this project.' : undefined}
          </EmptyState>
        ) : (
          <ul className="stack">
            {project.members.map((m) => (
              <li key={m.id} className="row-between">
                <Link to={`/people/${m.personId}`} className="person-cell">
                  <Avatar name={m.fullName} photo={m.photoKey} size={32} />
                  <span className="person-cell-text">
                    <span>{m.fullName}</span>
                    <span className="caption muted">{m.role}</span>
                  </span>
                </Link>
                <div className="cluster">
                  {isStatus(m.status) && m.status !== 'active' && <StatusBadge status={m.status} />}
                  {manage && (
                    <Button
                      size="sm"
                      variant="danger-quiet"
                      icon="trash"
                      busy={busy === m.id}
                      onClick={() => void run(m.id, () => api('/api/projects/:id/members/:memberId', { method: 'DELETE', params: { id: project.id, memberId: m.id } }))}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
