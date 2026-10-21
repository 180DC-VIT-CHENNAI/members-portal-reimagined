import { type FormEvent, useEffect, useState } from 'react';
import { Icon } from '../components/icons.tsx';
import { ConversationButton } from '../components/messages/ConversationButton.tsx';
import {
  Alert,
  Avatar,
  BackLink,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  ProblemAlert,
  SelectField,
  StatusBadge,
  TextAreaField,
  TextField,
  useTitle,
} from '../components/ui.tsx';
import { api, invalidate, lookups, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { formatDate, isHttpsUrl, lookupName, STATUS_LABEL, today, TRANSITIONS } from '../lib/format.ts';
import { useSession } from '../lib/session.tsx';
import type { Department, Grant, PersonDetail, PersonStatus, Position, ProfilePatch, RolesResponse, Term } from '../lib/types.ts';

export function PersonPage({ id }: { id: string }) {
  const session = useSession();
  const person = useLoad(() => api('/api/people/:id', { params: { id } }), [id]);
  const [departments, setDepartments] = useState<Department[]>();
  const [positions, setPositions] = useState<Position[]>();
  const [terms, setTerms] = useState<Term[]>();
  useEffect(() => {
    void lookups.departments().then(setDepartments, () => {});
    void lookups.positions().then(setPositions, () => {});
    void lookups.terms().then(setTerms, () => {});
  }, []);
  useTitle(person.data?.fullName ?? 'Person');

  if (person.problem) {
    return (
      <div className="page">
        <ErrorState problem={person.problem} onRetry={person.reload} />
      </div>
    );
  }
  if (!person.data) {
    return (
      <div className="page">
        <LoadingBlock rows={8} />
      </div>
    );
  }

  const p = person.data;
  const self = p.id === session.me.id;
  const dept = lookupName(departments, p.departmentId, (d) => d.name);
  const current = p.tenures.filter((t) => !t.endedOn && terms?.find((term) => term.id === t.termId)?.isCurrent);
  const reload = () => {
    person.reload();
    if (self) session.refresh();
  };

  return (
    <div className="page">
      {session.can('people.view') && <BackLink to="/people">Directory</BackLink>}
      <div className="person-layout">
        <aside className="person-aside">
          <div className="card">
            <div className="card-inner profile-summary">
              <Avatar name={p.fullName} photo={p.photoKey} size={88} />
              <h1>{p.fullName}</h1>
              <p className="muted wrap-anywhere">{p.email}</p>
              <StatusBadge status={p.status} />
              {!self && (p.status === 'active' || p.status === 'on_leave') && <ConversationButton target={{ personId: p.id }} />}
              <dl className="summary-list">
                <div>
                  <dt>Department</dt>
                  <dd>{dept ?? 'Club-wide'}</dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>{current.map((t) => t.title).join(', ') || 'None this term'}</dd>
                </div>
                <div>
                  <dt>Access role</dt>
                  <dd>{p.accessRoleId}</dd>
                </div>
              </dl>
            </div>
          </div>
        </aside>
        <div className="stack">
          <ProfileCard person={p} self={self} departments={departments} onSaved={(next) => (self ? reload() : person.setData(next))} />
          <TenureCard person={p} positions={positions} terms={terms} departments={departments} onChanged={person.reload} />
          {!self && session.can('people.lifecycle', p.departmentId) && <StatusCard person={p} onChanged={person.reload} />}
          {!self && session.can('people.grants') && p.grants && <AccessCard person={p} grants={p.grants} departments={departments} onChanged={person.reload} />}
          {self && (
            <Alert tone="info" title="Your access">
              Your status and access role can only be changed by someone else with permission.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileCard({
  person,
  self,
  departments,
  onSaved,
}: {
  person: PersonDetail;
  self: boolean;
  departments: Department[] | undefined;
  onSaved: (next: PersonDetail) => void;
}) {
  const { can } = useSession();
  const [editing, setEditing] = useState(false);
  const canEdit = self || can('people.edit', person.departmentId);
  const privateHidden = person.phone === null && person.regNo === null && !self;

  return (
    <Card
      title="Profile"
      actions={
        canEdit && (
          <Button size="sm" icon="pencil" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )
      }
    >
      <dl className="dl">
        <div>
          <dt>Phone</dt>
          <dd>{person.phone ?? <span className="muted">{privateHidden ? 'Private' : 'Not set'}</span>}</dd>
        </div>
        <div>
          <dt>Registration no.</dt>
          <dd className="mono">{person.regNo ?? <span className="muted">{privateHidden ? 'Private' : 'Not set'}</span>}</dd>
        </div>
        <div>
          <dt>Year</dt>
          <dd>{person.year ?? <span className="muted">Not set</span>}</dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd>{person.branch ?? <span className="muted">Not set</span>}</dd>
        </div>
        <div>
          <dt>LinkedIn</dt>
          <dd>
            <ExternalLink url={person.linkedinUrl} />
          </dd>
        </div>
        <div>
          <dt>GitHub</dt>
          <dd>
            <ExternalLink url={person.githubUrl} />
          </dd>
        </div>
        <div className="span-all">
          <dt>Skills</dt>
          <dd>
            {person.skills?.length ? (
              <ul className="chips">
                {person.skills.map((s) => (
                  <li key={s} className="chip">
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="muted">None listed</span>
            )}
          </dd>
        </div>
        <div className="span-all">
          <dt>About</dt>
          <dd className="prose">{person.bio || <span className="muted">Nothing yet</span>}</dd>
        </div>
      </dl>
      <Dialog open={editing} title={self ? 'Edit your profile' : `Edit ${person.fullName}`} onClose={() => setEditing(false)}>
        {editing && (
          <ProfileForm
            person={person}
            departments={departments}
            canMove={can('people.edit', person.departmentId)}
            onCancel={() => setEditing(false)}
            onSaved={(next) => {
              setEditing(false);
              onSaved(next);
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function ExternalLink({ url }: { url: string | null }) {
  if (!isHttpsUrl(url)) return <span className="muted">Not set</span>;
  return (
    <a className="text-link wrap-anywhere" href={url} target="_blank" rel="noopener noreferrer">
      {url.replace(/^https:\/\/(www\.)?/, '')}
      <Icon name="externalLink" size={14} label="opens in a new tab" />
    </a>
  );
}

const emptyToNull = (value: string) => (value.trim() === '' ? null : value.trim());

function ProfileForm({
  person,
  departments,
  canMove,
  onCancel,
  onSaved,
}: {
  person: PersonDetail;
  departments: Department[] | undefined;
  canMove: boolean;
  onCancel: () => void;
  onSaved: (next: PersonDetail) => void;
}) {
  const [form, setForm] = useState({
    fullName: person.fullName,
    phone: person.phone ?? '',
    regNo: person.regNo ?? '',
    year: person.year ? String(person.year) : '',
    branch: person.branch ?? '',
    linkedinUrl: person.linkedinUrl ?? '',
    githubUrl: person.githubUrl ?? '',
    photoKey: person.photoKey ?? '',
    skills: (person.skills ?? []).join(', '),
    bio: person.bio ?? '',
    departmentId: person.departmentId ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const body: ProfilePatch = {
      fullName: form.fullName.trim(),
      phone: emptyToNull(form.phone),
      regNo: emptyToNull(form.regNo),
      year: form.year ? Number(form.year) : null,
      branch: emptyToNull(form.branch),
      linkedinUrl: emptyToNull(form.linkedinUrl),
      githubUrl: emptyToNull(form.githubUrl),
      photoKey: emptyToNull(form.photoKey),
      bio: emptyToNull(form.bio),
      skills: form.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    if (canMove && (form.departmentId || null) !== person.departmentId) body.departmentId = form.departmentId || null;
    try {
      const next = await api('/api/people/:id', { method: 'PATCH', params: { id: person.id }, body });
      onSaved({ ...person, ...next, tenures: person.tenures, grants: person.grants });
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };

  const err = (field: string) => problem?.fields[field];
  const shown = ['fullName', 'phone', 'regNo', 'year', 'branch', 'linkedinUrl', 'githubUrl', 'photoKey', 'skills', 'bio', 'departmentId'];
  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <TextField label="Full name" value={form.fullName} onChange={set('fullName')} error={err('fullName')} required autoComplete="name" />
        <TextField label="Phone" value={form.phone} onChange={set('phone')} error={err('phone')} optional type="tel" autoComplete="tel" />
        <TextField label="Registration no." value={form.regNo} onChange={set('regNo')} error={err('regNo')} optional />
        <SelectField label="Year" value={form.year} onChange={set('year')} error={err('year')} optional>
          <option value="">Not set</option>
          {[1, 2, 3, 4, 5, 6].map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </SelectField>
        <TextField label="Branch" value={form.branch} onChange={set('branch')} error={err('branch')} optional placeholder="e.g. CSE" />
        {canMove && (
          <SelectField label="Department" value={form.departmentId} onChange={set('departmentId')} error={err('departmentId')}>
            <option value="">Club-wide</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
        )}
        <TextField
          label="LinkedIn"
          value={form.linkedinUrl}
          onChange={set('linkedinUrl')}
          error={err('linkedinUrl')}
          optional
          type="url"
          placeholder="https://www.linkedin.com/in/…"
        />
        <TextField label="GitHub" value={form.githubUrl} onChange={set('githubUrl')} error={err('githubUrl')} optional type="url" placeholder="https://github.com/…" />
        <TextField
          label="Photo link"
          hint="An https:// link to a square photo."
          value={form.photoKey}
          onChange={set('photoKey')}
          error={err('photoKey')}
          optional
          type="url"
        />
        <TextField label="Skills" hint="Separate with commas." value={form.skills} onChange={set('skills')} error={err('skills')} optional />
      </div>
      <TextAreaField label="About" value={form.bio} onChange={set('bio')} error={err('bio')} optional rows={4} maxLength={1000} />
      <ProblemAlert problem={problem} fieldsShown={shown} />
      <div className="form-actions">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={busy}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

function TenureCard({
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
                  <td className="cell-actions">
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

function AddTenureForm({
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

const STATUS_HELP: Record<PersonStatus, string> = {
  invited: 'Can sign in for the first time with Google.',
  active: 'Full access for their role.',
  on_leave: 'Keeps access while away.',
  alumni: 'Access ends now. The profile and history stay.',
  removed: 'Access ends now. The profile and history stay.',
};

function StatusCard({ person, onChanged }: { person: PersonDetail; onChanged: () => void }) {
  const options = TRANSITIONS[person.status];
  const [target, setTarget] = useState<PersonStatus | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const endsAccess = target === 'alumni' || target === 'removed';

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api('/api/people/:id/status', { method: 'POST', params: { id: person.id }, body: { status: target, note: note.trim() || undefined } });
      setTarget(null);
      setNote('');
      setProblem(null);
      onChanged();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Status" description={`Currently ${STATUS_LABEL[person.status].toLowerCase()}. ${STATUS_HELP[person.status]}`}>
      <div className="cluster">
        {options.map((s) => (
          <Button key={s} variant={s === 'alumni' || s === 'removed' ? 'danger-quiet' : 'secondary'} onClick={() => setTarget(s)}>
            {person.status === 'removed' && s === 'active' ? 'Reinstate' : `Move to ${STATUS_LABEL[s].toLowerCase()}`}
          </Button>
        ))}
      </div>
      <ConfirmDialog
        open={target !== null}
        title={target ? `Move ${person.fullName} to ${STATUS_LABEL[target].toLowerCase()}?` : ''}
        confirmLabel="Change status"
        tone={endsAccess ? 'danger' : 'primary'}
        busy={busy}
        problem={problem}
        onConfirm={confirm}
        onClose={() => {
          setTarget(null);
          setProblem(null);
        }}
      >
        {target && <p>{STATUS_HELP[target]}</p>}
        {endsAccess && <p>They are signed out everywhere straight away.</p>}
        <TextAreaField label="Note" optional hint="Saved in the audit log." rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </ConfirmDialog>
    </Card>
  );
}

function AccessCard({
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
