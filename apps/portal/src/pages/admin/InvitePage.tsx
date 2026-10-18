import { type FormEvent, useEffect, useState } from 'react';
import { BackLink, Button, Card, PageHeader, ProblemAlert, SelectField, TextField } from '../../components/ui.tsx';
import { api, lookups, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { navigate } from '../../lib/router.tsx';
import { useSession } from '../../lib/session.tsx';
import type { Department, Position, RolesResponse } from '../../lib/types.ts';
import { Forbidden } from './Forbidden.tsx';

export function InvitePage() {
  const { can, me } = useSession();
  const [departments, setDepartments] = useState<Department[]>();
  const [positions, setPositions] = useState<Position[]>();
  const [roles, setRoles] = useState<RolesResponse['roles']>();
  const [form, setForm] = useState({ email: '', fullName: '', departmentId: me.departmentId ?? '', accessRoleId: 'member', positionId: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  useEffect(() => {
    void lookups.departments().then(setDepartments, () => {});
    void lookups.positions().then(setPositions, () => {});
    void lookups.roles().then((r) => setRoles(r.roles), () => {});
  }, []);

  if (!can('people.invite')) return <Forbidden title="Invite" />;
  const invitable = departments?.filter((d) => can('people.invite', d.id)) ?? [];
  const deptPositions = positions?.filter((p) => p.active && (p.departmentId === (form.departmentId || null) || p.departmentId === null)) ?? [];
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value, ...(key === 'departmentId' ? { positionId: '' } : {}) });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      // Void infers `never` for `c.json(body, 201)` responses; the route returns `{ id, status, campaignId }`.
      const created: { id: string } = await api('/api/people', {
        method: 'POST',
        body: {
          email: form.email,
          fullName: form.fullName,
          departmentId: form.departmentId || null,
          accessRoleId: form.accessRoleId,
          positionId: form.positionId || undefined,
        },
      });
      navigate(`/people/${created.id}`);
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };

  const err = (f: string) => problem?.fields[f];
  return (
    <div className="page page-narrow">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader overline="People" title="Invite someone" lede="We'll email them a link to sign in with Google: no password or code. Their first sign-in makes them active." />
      <Card>
        <form className="form" onSubmit={submit} noValidate>
          <div className="form-grid">
            <TextField label="Email" type="email" value={form.email} onChange={set('email')} error={err('email')} required autoComplete="off" hint="The Google account they'll sign in with. The invitation is sent here." />
            <TextField label="Full name" value={form.fullName} onChange={set('fullName')} error={err('fullName')} required />
            <SelectField label="Department" value={form.departmentId} onChange={set('departmentId')} error={err('departmentId')}>
              {can('people.invite', null) && <option value="">Club-wide</option>}
              {invitable.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Position" optional value={form.positionId} onChange={set('positionId')} hint="Recorded for the current term.">
              <option value="">No position yet</option>
              {deptPositions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Access role"
              value={form.accessRoleId}
              onChange={set('accessRoleId')}
              disabled={!can('people.grants')}
              hint={can('people.grants') ? undefined : 'Only people who manage access can give other roles.'}
            >
              {(can('people.grants') ? roles : roles?.filter((r) => r.id === 'member'))?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectField>
          </div>
          <ProblemAlert problem={problem} fieldsShown={['email', 'fullName', 'departmentId']} />
          <div className="form-actions">
            <Button type="submit" variant="primary" icon="userPlus" busy={busy}>
              Invite
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
