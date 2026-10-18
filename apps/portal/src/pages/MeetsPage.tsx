import { type FormEvent, useState } from 'react';
import { Icon } from '../components/icons.tsx';
import { MeetFollowThrough } from '../components/meetings/MeetFollowThrough.tsx';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  ProblemAlert,
  SelectField,
  TextAreaField,
  TextField,
} from '../components/ui.tsx';
import { api, lookups, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { formatDateTime, plural } from '../lib/format.ts';
import { useSession } from '../lib/session.tsx';

const KIND_LABEL = { club: 'Club-wide', department: 'Department', inter_department: 'Inter-department' } as const;
type Kind = keyof typeof KIND_LABEL;
const DAY_MS = 86_400_000;

const loadMeets = () => api('/api/meets');
type Meet = Awaited<ReturnType<typeof loadMeets>>[number];
type Can = ReturnType<typeof useSession>['can'];
type Department = { id: string; name: string };

/** Who may remove or re-announce a meet; mirrors requireMeetManage on the server. */
function canManage(can: Can, meet: Meet): boolean {
  switch (meet.kind) {
    case 'club':
      return can('meets.club.manage', null);
    case 'inter_department':
      return can('meets.inter_department.manage', null);
    case 'department':
      return can('meets.department.manage', meet.departments[0]?.id ?? null);
    default: {
      const unhandled: never = meet.kind;
      return unhandled;
    }
  }
}

/** Club-wide, department and inter-department meets, with scheduling for people who may manage them. */
export function MeetsPage() {
  const { can } = useSession();
  const meets = useLoad(loadMeets, []);
  const departments = useLoad(() => lookups.departments(), []);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Meet | null>(null);

  const active = (departments.data ?? []).filter((d) => d.active);
  const ownDepartments = active.filter((d) => can('meets.department.manage', d.id));
  const kinds: Kind[] = [];
  if (can('meets.club.manage', null)) kinds.push('club');
  if (ownDepartments.length) kinds.push('department');
  if (can('meets.inter_department.manage', null)) kinds.push('inter_department');

  const announce = async (meet: Meet) => {
    setBusy(meet.id);
    setProblem(null);
    setNotice(null);
    try {
      const sent = await api('/api/meets/:id/notify', { method: 'POST', params: { id: meet.id } });
      setNotice(sent.queued ? `An email about "${meet.title}" is on its way to ${plural(sent.queued, 'member')}.` : `Nobody to email about "${meet.title}".`);
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(removing.id);
    setProblem(null);
    try {
      await api('/api/meets/:id', { method: 'DELETE', params: { id: removing.id } });
      setRemoving(null);
      meets.reload();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(null);
    }
  };

  const now = Date.now();
  const all = meets.data ?? [];
  const upcoming = all.filter((m) => Date.parse(m.scheduledAt) >= now - DAY_MS);
  const past = all.filter((m) => Date.parse(m.scheduledAt) < now - DAY_MS).reverse();
  const item = (m: Meet) => (
    <MeetItem
      key={m.id}
      meet={m}
      manage={canManage(can, m)}
      busy={busy === m.id}
      onAnnounce={() => announce(m)}
      onChanged={meets.reload}
      onRemove={() => {
        setProblem(null);
        setRemoving(m);
      }}
    />
  );

  return (
    <div className="page page-narrow">
      <PageHeader overline="Club" title="Meets" lede="Club-wide, department and inter-department meetings. A meet's link disappears a day after it starts." />
      <div className="stack">
        {kinds.length > 0 && (
          <ScheduleMeet
            kinds={kinds}
            departments={active}
            ownDepartments={ownDepartments}
            onScheduled={(text) => {
              setNotice(text);
              meets.reload();
            }}
          />
        )}
        {notice && (
          <p role="status" className="caption">
            {notice}
          </p>
        )}
        <ProblemAlert problem={removing ? null : problem} />
        {meets.problem ? (
          <ErrorState problem={meets.problem} onRetry={meets.reload} />
        ) : !meets.data ? (
          <LoadingBlock />
        ) : (
          <>
            <Card title="Upcoming" description="Everything from the last day onwards, earliest first.">
              {upcoming.length === 0 ? <EmptyState icon="calendar" title="No meets coming up" /> : <ul className="stack">{upcoming.map(item)}</ul>}
            </Card>
            {past.length > 0 && (
              <Card title="Past" description="Most recent first. Their links are no longer shown.">
                <ul className="stack">{past.map(item)}</ul>
              </Card>
            )}
          </>
        )}
      </div>
      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove "${removing.title}"?` : ''}
        confirmLabel="Remove meet"
        tone="danger"
        busy={removing !== null && busy === removing.id}
        problem={removing ? problem : null}
        onConfirm={remove}
        onClose={() => {
          setRemoving(null);
          setProblem(null);
        }}
      >
        <p>Members will no longer see it. Emails already queued about it still go out.</p>
      </ConfirmDialog>
    </div>
  );
}

function MeetItem({
  meet,
  manage,
  busy,
  onAnnounce,
  onRemove,
  onChanged,
}: {
  meet: Meet;
  manage: boolean;
  busy: boolean;
  onAnnounce: () => void;
  onRemove: () => void;
  onChanged: () => void;
}) {
  const where = meet.departments.map((d) => d.name).join(', ');
  const link = meet.meetLink && /^https?:\/\//i.test(meet.meetLink) ? meet.meetLink : null;
  return (
    <li className="stack-sm">
      <div className="cluster">
        <strong>{meet.title}</strong>
        <span className="badge">{KIND_LABEL[meet.kind]}</span>
      </div>
      <p className="caption muted">
        {formatDateTime(meet.scheduledAt)}
        {where && ` · ${where}`}
      </p>
      {meet.description && <p className="pre-wrap">{meet.description}</p>}
      <MeetFollowThrough meet={meet} manage={manage} onChanged={onChanged} />
      {(link || manage) && (
        <div className="cluster">
          {link && (
            <a className="btn btn-secondary btn-sm" href={link} target="_blank" rel="noopener noreferrer">
              <Icon name="externalLink" size={16} />
              Join
            </a>
          )}
          {manage && (
            <>
              <Button size="sm" icon="megaphone" busy={busy} onClick={onAnnounce}>
                Email again
              </Button>
              <Button size="sm" variant="danger-quiet" icon="trash" disabled={busy} onClick={onRemove}>
                Remove
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function ScheduleMeet({
  kinds,
  departments,
  ownDepartments,
  onScheduled,
}: {
  kinds: Kind[];
  departments: Department[];
  ownDepartments: Department[];
  onScheduled: (notice: string) => void;
}) {
  const [kind, setKind] = useState<Kind>(kinds[0] ?? 'club');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [link, setLink] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  // Departments load after the form first renders, so default to the first one the caller manages.
  const departmentId = ownDepartments.some((d) => d.id === department) ? department : (ownDepartments[0]?.id ?? '');
  const departmentIds = kind === 'department' ? (departmentId ? [departmentId] : []) : kind === 'inter_department' ? selected : [];
  const ready = title.trim() !== '' && when !== '' && (kind === 'club' || departmentIds.length > 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      // Void infers `never` for `c.json(body, 201)` responses; the route returns `{ id, campaignId, queued }`.
      const made = (await api('/api/meets', {
        method: 'POST',
        body: {
          kind,
          title,
          scheduledAt: new Date(when).toISOString(),
          meetLink: link.trim() || null,
          description: description.trim() || null,
          departmentIds,
        },
      })) as unknown as { id: string; campaignId: string | null; queued: number };
      const name = title.trim();
      onScheduled(made.queued ? `"${name}" is scheduled; ${plural(made.queued, 'member')} will get an email.` : `"${name}" is scheduled; there was nobody to email.`);
      setTitle('');
      setWhen('');
      setLink('');
      setDescription('');
      setSelected([]);
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Schedule a meet" description="Everyone the meet is for gets an email when you schedule it.">
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <SelectField label="Kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </SelectField>
          <TextField label="When" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} error={problem?.fields.scheduledAt} required />
        </div>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={problem?.fields.title} required maxLength={255} />
        {kind === 'department' && (
          <SelectField label="Department" value={departmentId} onChange={(e) => setDepartment(e.target.value)}>
            {ownDepartments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
        )}
        {kind === 'inter_department' && (
          <fieldset className="check-group">
            <legend>Departments</legend>
            {departments.map((d) => (
              <label key={d.id} className="check">
                <input
                  type="checkbox"
                  checked={selected.includes(d.id)}
                  onChange={(e) => setSelected((current) => (e.target.checked ? [...current, d.id] : current.filter((id) => id !== d.id)))}
                />
                {d.name}
              </label>
            ))}
          </fieldset>
        )}
        <TextField
          label="Meeting link"
          type="url"
          optional
          value={link}
          onChange={(e) => setLink(e.target.value)}
          error={problem?.fields.meetLink}
          placeholder="https://meet.google.com/..."
          maxLength={500}
        />
        <TextAreaField label="Details" optional value={description} onChange={(e) => setDescription(e.target.value)} error={problem?.fields.description} rows={3} maxLength={2000} />
        <ProblemAlert problem={problem} fieldsShown={['title', 'scheduledAt', 'meetLink', 'description']} />
        <div className="form-actions">
          <Button type="submit" variant="primary" icon="calendar" busy={busy} disabled={!ready}>
            Schedule and email
          </Button>
        </div>
      </form>
    </Card>
  );
}
