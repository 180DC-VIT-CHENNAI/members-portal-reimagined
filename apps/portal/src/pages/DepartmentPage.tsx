import { type FormEvent, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  ProblemAlert,
  SelectField,
  StatusBadge,
  TextAreaField,
  TextField,
} from '../components/ui.tsx';
import { Link, navigate } from '../lib/router.tsx';
import { api, lookups, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { formatDate, formatDateTime, isHttpsUrl, isStatus } from '../lib/format.ts';
import { useSession } from '../lib/session.tsx';
import { ConversationButton } from '../components/messages/ConversationButton.tsx';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const PRIORITY_TONE: Record<(typeof PRIORITIES)[number], string> = { low: '', medium: '', high: 'badge-warning', urgent: 'badge-error' };

/** A department's members, instructions and (for its leads) documents and projects. */
export function DepartmentPage({ id }: { id: string }) {
  const { can, me } = useSession();
  const departments = useLoad(() => lookups.departments(), []);
  const visible = (departments.data ?? []).filter(
    (d) => can('departments.members.view', d.id) || can('departments.instructions.view', d.id) || can('departments.workspace.view', d.id),
  );
  const department = departments.data?.find((d) => d.id === id);

  if (departments.problem) return <ErrorState problem={departments.problem} onRetry={departments.reload} />;
  if (!departments.data) return <LoadingBlock />;
  return (
    <div className="page">
      <PageHeader
        overline="Department"
        title={department?.name ?? 'Department'}
        lede={department?.description ?? undefined}
        actions={
          visible.length > 1 && (
            <SelectField label="Department" value={id} onChange={(e) => navigate(`/departments/${e.target.value}`)}>
              {visible.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
          )
        }
      />
      {!department || !visible.some((d) => d.id === id) ? (
        <EmptyState icon="users" title="You don't have access to this department" />
      ) : (
        <div className="stack">
          {(me.departmentId === id || can('departments.workspace.view', id)) && <ConversationButton target={{ departmentId: id }} />}
          {can('departments.instructions.view', id) && <Instructions departmentId={id} manage={can('departments.instructions.manage', id)} />}
          {can('departments.workspace.view', id) && <Workspace departmentId={id} />}
          {can('departments.members.view', id) && <Members departmentId={id} />}
        </div>
      )}
    </div>
  );
}

function Members({ departmentId }: { departmentId: string }) {
  const members = useLoad(() => api('/api/departments/:id/members', { params: { id: departmentId } }), [departmentId]);
  return (
    <Card title="Members" description="Everyone in this department with access, and the positions they hold this term." flush>
      {members.problem ? (
        <ErrorState problem={members.problem} onRetry={members.reload} />
      ) : !members.data ? (
        <LoadingBlock rows={3} />
      ) : members.data.length === 0 ? (
        <EmptyState icon="users" title="No members yet" />
      ) : (
        <div className="table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Positions</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.data.map((m) => (
                <tr key={m.id}>
                  <td className="cell-primary">
                    <Link to={`/people/${m.id}`} className="person-cell">
                      <Avatar name={m.fullName} photo={m.photoKey} size={32} />
                      <span className="person-cell-text">
                        <span>{m.fullName}</span>
                        <span className="caption muted">{m.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td data-label="Positions">{m.positions.map((p) => p.title).join(', ') || '—'}</td>
                  <td data-label="Status">{isStatus(m.status) && <StatusBadge status={m.status} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Instructions({ departmentId, manage }: { departmentId: string; manage: boolean }) {
  const list = useLoad(() => api('/api/departments/:id/instructions', { params: { id: departmentId } }), [departmentId]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('medium');
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('new');
    setProblem(null);
    try {
      await api('/api/departments/:id/instructions', { method: 'POST', params: { id: departmentId }, body: { title, content, priority } });
      setTitle('');
      setContent('');
      setPriority('medium');
      list.reload();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(null);
    }
  };
  const remove = async (instructionId: string) => {
    setBusy(instructionId);
    setProblem(null);
    try {
      await api('/api/departments/:id/instructions/:instructionId', { method: 'DELETE', params: { id: departmentId, instructionId } });
      list.reload();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="Instructions" description="Standing instructions from the department's leads, newest first.">
      <div className="stack">
        {manage && (
          <form className="form" onSubmit={submit}>
            <div className="form-grid">
              <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={problem?.fields.title} required maxLength={255} />
              <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </SelectField>
            </div>
            <TextAreaField label="Instruction" value={content} onChange={(e) => setContent(e.target.value)} error={problem?.fields.content} required rows={3} maxLength={5000} />
            <div className="form-actions">
              <Button type="submit" variant="primary" icon="plus" busy={busy === 'new'} disabled={!title.trim() || !content.trim()}>
                Add instruction
              </Button>
            </div>
          </form>
        )}
        <ProblemAlert problem={problem} fieldsShown={['title', 'content']} />
        {list.problem ? (
          <ErrorState problem={list.problem} onRetry={list.reload} />
        ) : !list.data ? (
          <LoadingBlock rows={2} />
        ) : list.data.length === 0 ? (
          <EmptyState icon="bookOpen" title="No instructions yet" />
        ) : (
          <ul className="stack">
            {list.data.map((i) => (
              <li key={i.id} className="stack-sm">
                <div className="cluster">
                  <strong>{i.title}</strong>
                  <span className={`badge ${PRIORITY_TONE[i.priority]}`}>{i.priority}</span>
                </div>
                <p className="pre-wrap">{i.content}</p>
                <div className="cluster">
                  <span className="caption muted">
                    {i.authorName ?? 'Club'} · {formatDateTime(i.createdAt)}
                  </span>
                  {manage && (
                    <Button size="sm" variant="danger-quiet" icon="trash" busy={busy === i.id} onClick={() => remove(i.id)}>
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

function Workspace({ departmentId }: { departmentId: string }) {
  const { can } = useSession();
  const overview = useLoad(() => api('/api/departments/:id/overview', { params: { id: departmentId } }), [departmentId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const manageDocs = can('departments.documents.manage', departmentId);
  const manageProjects = can('departments.projects.manage', departmentId);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setProblem(null);
    try {
      await action();
      overview.reload();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(null);
    }
  };

  if (overview.problem) return <ErrorState problem={overview.problem} onRetry={overview.reload} />;
  if (!overview.data) return <LoadingBlock rows={4} />;
  const { documents, projects } = overview.data;
  return (
    <>
      <ProblemAlert problem={problem} />
      <Card title="Projects" description="The same project workspace, filtered to this department.">
        <div className="stack">
          {manageProjects && (
            <Button icon="plus" onClick={() => navigate(`/projects/new?department=${encodeURIComponent(departmentId)}&internal=1`)}>
              New department project
            </Button>
          )}
          {projects.length === 0 ? (
            <EmptyState icon="briefcase" title="No department projects yet" />
          ) : (
            <ul className="stack">
              {projects.map((p) => (
                <li key={p.id} className="row-between">
                  <span className="person-cell-text">
                    <Link to={`/projects/${p.id}`}><strong>{p.name}</strong></Link>
                    <span className="caption muted">{[p.description, p.deadline && `Due ${formatDate(p.deadline)}`].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="badge">{p.status.replace('_', ' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      <Card title="Documents" description="Links to the department's working documents.">
        <div className="stack">
          {manageDocs && <NewDocument departmentId={departmentId} onAdded={overview.reload} />}
          {documents.length === 0 ? (
            <EmptyState icon="fileText" title="No documents yet" />
          ) : (
            <ul className="stack">
              {documents.map((d) => (
                <li key={d.id} className="row-between">
                  <span className="person-cell-text">
                    {isHttpsUrl(d.fileUrl) ? (
                      <a href={d.fileUrl} target="_blank" rel="noopener noreferrer">
                        <strong>{d.title}</strong>
                      </a>
                    ) : (
                      <strong>{d.title}</strong>
                    )}
                    <span className="caption muted">{[d.description, `${d.authorName ?? 'Club'} · ${formatDate(d.createdAt)}`].filter(Boolean).join(' · ')}</span>
                  </span>
                  {manageDocs && (
                    <Button
                      size="sm"
                      variant="danger-quiet"
                      icon="trash"
                      busy={busy === d.id}
                      onClick={() => run(d.id, () => api('/api/departments/:id/documents/:documentId', { method: 'DELETE', params: { id: departmentId, documentId: d.id } }))}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}

function NewDocument({ departmentId, onAdded }: { departmentId: string; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/departments/:id/documents', { method: 'POST', params: { id: departmentId }, body: { title, fileUrl: fileUrl || null } });
      setTitle('');
      setFileUrl('');
      onAdded();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={problem?.fields.title} required maxLength={255} />
        <TextField label="Link" type="url" optional placeholder="https://" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} error={problem?.fields.fileUrl} />
      </div>
      <ProblemAlert problem={problem} fieldsShown={['title', 'fileUrl']} />
      <div className="form-actions">
        <Button type="submit" variant="primary" icon="plus" busy={busy} disabled={!title.trim()}>
          Add document
        </Button>
      </div>
    </form>
  );
}
