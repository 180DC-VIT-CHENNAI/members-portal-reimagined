import { type FormEvent, useEffect, useState } from 'react';
import { Alert, BackLink, Button, Card, ErrorState, LoadingBlock, PageHeader, ProblemAlert, TextField } from '../../components/ui.tsx';
import { api, invalidate, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { plural } from '../../lib/format.ts';
import { useSession } from '../../lib/session.tsx';
import type { AccessRole } from '../../lib/types.ts';
import { Forbidden } from './Forbidden.tsx';

type Scope = '' | 'department' | 'global';

export function RolesPage() {
  const { can } = useSession();
  const roles = useLoad(() => api('/api/access-roles'), []);
  const [selected, setSelected] = useState<string>('');
  if (!can('roles.manage')) return <Forbidden title="Access roles" />;

  const list = roles.data?.roles ?? [];
  const role = list.find((r) => r.id === selected) ?? list[0];
  return (
    <div className="page">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader
        overline="Access"
        title="Access roles"
        lede="What each role may do. Department scope means the holder's own department only. Admin always has everything."
      />
      {roles.problem ? (
        <ErrorState problem={roles.problem} onRetry={roles.reload} />
      ) : !roles.data || !role ? (
        <LoadingBlock />
      ) : (
        <div className="split">
          <div className="stack">
            <ul className="role-list" aria-label="Roles">
              {list.map((r) => (
                <li key={r.id}>
                  <button type="button" className="role-item" aria-current={r.id === role.id ? 'true' : undefined} onClick={() => setSelected(r.id)}>
                    <span className="role-name">{r.name}</span>
                    <span className="caption muted">{plural(r.permissions.length, 'permission')}</span>
                  </button>
                </li>
              ))}
            </ul>
            <NewRole
              onCreated={(id) => {
                setSelected(id);
                invalidate('roles');
                roles.reload();
              }}
            />
          </div>
          <RoleEditor
            key={role.id}
            role={role}
            catalogue={roles.data.catalogue}
            onSaved={() => {
              invalidate('roles');
              roles.reload();
            }}
          />
        </div>
      )}
    </div>
  );
}

function RoleEditor({ role, catalogue, onSaved }: { role: AccessRole; catalogue: Record<string, string>; onSaved: () => void }) {
  const fixed = role.id === 'admin';
  const initial = () => Object.fromEntries(role.permissions.map((p) => [p.permission, p.scope])) as Record<string, Scope>;
  const [scopes, setScopes] = useState<Record<string, Scope>>(initial);
  const [name, setName] = useState(role.name);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  useEffect(() => setSaved(false), [scopes, name]);

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const permissions = Object.entries(scopes)
        .filter((entry): entry is [string, 'department' | 'global'] => entry[1] !== '')
        .map(([permission, scope]) => ({ permission, scope }));
      await api('/api/access-roles/:id', { method: 'PUT', params: { id: role.id }, body: { name: name.trim(), permissions } });
      setSaved(true);
      onSaved();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={role.name} description={role.description ?? undefined}>
      <div className="stack">
        {fixed && <Alert tone="info" title="Admin always has every permission everywhere, so the club can't lock itself out." />}
        {!fixed && <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />}
        <ul className="perm-list">
          {Object.entries(catalogue).map(([key, description]) => (
            <li key={key} className="perm-row">
              <div className="perm-text">
                <span>{description}</span>
                <code>{key}</code>
              </div>
              <div className="select-wrap">
                <select
                  className="select"
                  aria-label={`${description}: scope`}
                  value={fixed ? 'global' : (scopes[key] ?? '')}
                  disabled={fixed}
                  onChange={(e) => setScopes({ ...scopes, [key]: e.target.value as Scope })}
                >
                  <option value="">No</option>
                  <option value="department">Own department</option>
                  <option value="global">Everywhere</option>
                </select>
              </div>
            </li>
          ))}
        </ul>
        <ProblemAlert problem={problem} />
        {saved && <Alert tone="success" title="Role saved. Changes apply on each person's next request." />}
        {!fixed && (
          <div className="form-actions">
            <Button variant="primary" busy={busy} onClick={save}>
              Save role
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function NewRole({ onCreated }: { onCreated: (id: string) => void }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/access-roles/:id', { method: 'PUT', params: { id: id.trim() }, body: { name: name.trim(), permissions: [] } });
      setId('');
      setName('');
      onCreated(id.trim());
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="New role">
      <form className="form" onSubmit={submit}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Recruiter" />
        <TextField label="ID" value={id} onChange={(e) => setId(e.target.value.toLowerCase())} required placeholder="recruiter" hint="Lowercase letters, digits and underscores." />
        <ProblemAlert problem={problem} />
        <Button type="submit" icon="plus" busy={busy} disabled={!id.trim() || !name.trim()}>
          Create role
        </Button>
      </form>
    </Card>
  );
}
