import { type FormEvent, useState } from 'react';
import {
  Avatar,
  BackLink,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
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
import { api, lookups, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { formatDate, isStatus, plural } from '../lib/format.ts';
import { Link, navigate } from '../lib/router.tsx';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
type Priority = (typeof PRIORITIES)[number];
const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
const PRIORITY_TONE: Record<Priority, string> = { low: '', normal: '', high: 'badge-warning', urgent: 'badge-error' };

const loadProject = (id: string) => api('/api/projects/:id', { params: { id } });
const loadPeople = (id: string) => api('/api/projects/:id/people', { params: { id } });
type Project = Awaited<ReturnType<typeof loadProject>>;
type Task = Project['tasks'][number];
type Candidate = Awaited<ReturnType<typeof loadPeople>>[number];

/** One project: its details, tasks and people, with the actions the caller may take. */
export function ProjectPage({ id }: { id: string }) {
  const project = useLoad(() => loadProject(id), [id]);
  const access = project.data?.access;
  const picksPeople = Boolean(access && (access.manageMembers || access.manageTasks));
  const people = useLoad(() => (picksPeople ? loadPeople(id) : Promise.resolve<Candidate[]>([])), [id, picksPeople]);
  const [confirm, setConfirm] = useState<'complete' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  if (project.problem) return <ErrorState problem={project.problem} onRetry={project.reload} />;
  const p = project.data;
  if (!p) return <LoadingBlock />;

  const setStatus = async (status: 'active' | 'completed') => {
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/projects/:id/status', { method: 'PUT', params: { id }, body: { status } });
      setConfirm(null);
      project.reload();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/projects/:id', { method: 'DELETE', params: { id } });
      navigate('/projects');
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };
  const ask = (next: 'complete' | 'delete') => {
    setProblem(null);
    setConfirm(next);
  };

  const open = p.tasks.filter((t) => t.status === 'pending').length;
  const facts = [p.departments.map((d) => d.name).join(', '), p.termLabel, p.deadline && `Due ${formatDate(p.deadline)}`].filter(Boolean).join(' · ');
  return (
    <div className="page">
      <BackLink to="/projects">Projects</BackLink>
      <PageHeader
        overline={p.client ?? 'Project'}
        title={p.name}
        actions={
          p.access.manage && (
            <div className="cluster">
              <Button icon="pencil" onClick={() => navigate(`/projects/${id}/edit`)}>
                Edit
              </Button>
              {p.status === 'active' ? (
                <Button variant="primary" icon="checkCircle" onClick={() => ask('complete')}>
                  Mark completed
                </Button>
              ) : (
                <Button busy={busy} onClick={() => setStatus('active')}>
                  Reopen
                </Button>
              )}
              <Button variant="danger-quiet" icon="trash" onClick={() => ask('delete')}>
                Delete
              </Button>
            </div>
          )
        }
      />
      <div className="stack">
        <div className="cluster">
          <span className={p.status === 'completed' ? 'badge badge-success' : 'badge'}>{p.status === 'completed' ? 'Completed' : 'Active'}</span>
          <span className="caption muted">{facts}</span>
        </div>
        {p.description && <p className="pre-wrap">{p.description}</p>}
        <ProblemAlert problem={confirm ? null : problem} />
        <Tasks project={p} assignable={(people.data ?? []).filter((c) => c.canSee)} onChange={project.reload} />
        <Members
          project={p}
          candidates={people.data ?? []}
          onChange={() => {
            project.reload();
            people.reload();
          }}
        />
      </div>
      <ConfirmDialog
        open={confirm === 'complete'}
        title={`Mark "${p.name}" completed?`}
        confirmLabel="Mark completed"
        busy={busy}
        problem={confirm ? problem : null}
        onConfirm={() => setStatus('completed')}
        onClose={() => setConfirm(null)}
      >
        <p>It will be listed on the public site with its name, client and description.</p>
        {open > 0 && <p>{plural(open, 'task')} still open.</p>}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'delete'}
        title={`Delete "${p.name}"?`}
        confirmLabel="Delete project"
        tone="danger"
        busy={busy}
        problem={confirm ? problem : null}
        onConfirm={remove}
        onClose={() => setConfirm(null)}
      >
        <p>
          Its tasks and the list of people on it are deleted too.
          {p.status === 'completed' && ' It also comes off the public site.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}

function Tasks({ project, assignable, onChange }: { project: Project; assignable: Candidate[]; onChange: () => void }) {
  const manage = project.access.manageTasks;
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Task | null>(null);
  const done = project.tasks.filter((t) => t.status === 'completed').length;
  const editingTask = project.tasks.find((t) => t.id === editing) ?? null;

  const act = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setProblem(null);
    try {
      await action();
      setRemoving(null);
      onChange();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(null);
    }
  };
  const params = (taskId: string) => ({ id: project.id, taskId });

  return (
    <Card
      title="Tasks"
      description={project.tasks.length ? `${done} of ${project.tasks.length} done.` : 'Nothing to do yet.'}
      actions={
        manage &&
        done < project.tasks.length && (
          <Button
            size="sm"
            icon="checkCircle"
            busy={busy === 'all'}
            onClick={() => act('all', () => api('/api/projects/:id/complete-tasks', { method: 'POST', params: { id: project.id } }))}
          >
            Mark all done
          </Button>
        )
      }
    >
      <div className="stack">
        {manage && <NewTask projectId={project.id} assignable={assignable} onAdded={onChange} />}
        <ProblemAlert problem={removing ? null : problem} />
        {project.tasks.length > 0 && (
          <ul className="stack">
            {project.tasks.map((t) => (
              <li key={t.id} className="task">
                <label className="task-toggle">
                  <input
                    type="checkbox"
                    checked={t.status === 'completed'}
                    disabled={!t.canUpdateStatus || busy === t.id}
                    aria-label={t.status === 'pending' ? `Mark "${t.title}" done` : `Reopen "${t.title}"`}
                    onChange={() =>
                      act(t.id, () =>
                        api('/api/projects/:id/tasks/:taskId/status', {
                          method: 'PUT',
                          params: params(t.id),
                          body: { status: t.status === 'pending' ? 'completed' : 'pending' },
                        }),
                      )
                    }
                  />
                </label>
                <div className="stack-sm">
                  <div className="cluster">
                    <strong className={t.status === 'completed' ? 'task-done' : undefined}>{t.title}</strong>
                    {t.priority !== 'normal' && <span className={`badge ${PRIORITY_TONE[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</span>}
                  </div>
                  {t.description && <p className="pre-wrap">{t.description}</p>}
                  <p className="caption muted">
                    {t.assigneeName ?? 'Unassigned'}
                    {t.dueDate && ` · Due ${formatDate(t.dueDate)}`}
                    {t.completedAt && ` · Done ${formatDate(t.completedAt)}`}
                  </p>
                  {manage && (
                    <div className="cluster">
                      <Button
                        size="sm"
                        icon="pencil"
                        onClick={() => {
                          setProblem(null);
                          setEditing(t.id);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-quiet"
                        icon="trash"
                        onClick={() => {
                          setProblem(null);
                          setRemoving(t);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editingTask && (
        <TaskEditor
          key={editingTask.id}
          projectId={project.id}
          task={editingTask}
          assignable={assignable}
          onSaved={() => {
            setEditing(null);
            onChange();
          }}
          onConflict={onChange}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove "${removing.title}"?` : ''}
        confirmLabel="Remove task"
        tone="danger"
        busy={removing !== null && busy === removing.id}
        problem={removing ? problem : null}
        onConfirm={() => removing && act(removing.id, () => api('/api/projects/:id/tasks/:taskId', { method: 'DELETE', params: params(removing.id) }))}
        onClose={() => {
          setRemoving(null);
          setProblem(null);
        }}
      >
        <p>It is deleted for everyone on the project.</p>
      </ConfirmDialog>
    </Card>
  );
}

function AssigneeField({
  value,
  onChange,
  assignable,
  current,
}: {
  value: string;
  onChange: (id: string) => void;
  assignable: Candidate[];
  current?: { id: string; name: string } | null;
}) {
  return (
    <SelectField label="Assignee" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Unassigned</option>
      {current && !assignable.some((a) => a.id === current.id) && <option value={current.id}>{current.name} (can no longer see this project)</option>}
      {assignable.map((a) => (
        <option key={a.id} value={a.id}>
          {a.fullName}
        </option>
      ))}
    </SelectField>
  );
}

function PriorityField({ value, onChange }: { value: Priority; onChange: (priority: Priority) => void }) {
  return (
    <SelectField label="Priority" value={value} onChange={(e) => onChange(e.target.value as Priority)}>
      {PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {PRIORITY_LABEL[p]}
        </option>
      ))}
    </SelectField>
  );
}

function NewTask({ projectId, assignable, onAdded }: { projectId: string; assignable: Candidate[]; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/projects/:id/tasks', {
        method: 'POST',
        params: { id: projectId },
        body: { title, assigneeId: assigneeId || null, dueDate: dueDate || null, priority },
      });
      setTitle('');
      setAssigneeId('');
      setDueDate('');
      setPriority('normal');
      onAdded();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <TextField label="New task" value={title} onChange={(e) => setTitle(e.target.value)} error={problem?.fields.title} required maxLength={255} />
      <div className="form-grid">
        <AssigneeField value={assigneeId} onChange={setAssigneeId} assignable={assignable} />
        <TextField label="Due" type="date" optional value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={problem?.fields.dueDate} />
        <PriorityField value={priority} onChange={setPriority} />
      </div>
      <ProblemAlert problem={problem} fieldsShown={['title', 'dueDate']} />
      <div className="form-actions">
        <Button type="submit" variant="primary" icon="plus" busy={busy} disabled={!title.trim()}>
          Add task
        </Button>
      </div>
    </form>
  );
}

function TaskEditor({
  projectId,
  task,
  assignable,
  onSaved,
  onConflict,
  onClose,
}: {
  projectId: string;
  task: Task;
  assignable: Candidate[];
  onSaved: () => void;
  onConflict: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '');
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/projects/:id/tasks/:taskId', {
        method: 'PATCH',
        params: { id: projectId, taskId: task.id },
        body: { version: task.version, title, description: description.trim() || null, assigneeId: assigneeId || null, dueDate: dueDate || null, priority },
      });
      onSaved();
    } catch (err) {
      const next = problemFrom(err);
      setProblem(next);
      // Reload so a second save is checked against the latest version.
      if (next.status === 409) onConflict();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open title="Edit task" onClose={busy ? () => {} : onClose}>
      <form className="form" onSubmit={submit}>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={problem?.fields.title} required maxLength={255} />
        <TextAreaField
          label="Details"
          optional
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={problem?.fields.description}
          rows={3}
          maxLength={2000}
        />
        <div className="form-grid">
          <AssigneeField
            value={assigneeId}
            onChange={setAssigneeId}
            assignable={assignable}
            current={task.assigneeId ? { id: task.assigneeId, name: task.assigneeName ?? 'Current assignee' } : null}
          />
          <TextField label="Due" type="date" optional value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={problem?.fields.dueDate} />
          <PriorityField value={priority} onChange={setPriority} />
        </div>
        <ProblemAlert problem={problem} fieldsShown={['title', 'description', 'dueDate']} />
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!title.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Members({ project, candidates, onChange }: { project: Project; candidates: Candidate[]; onChange: () => void }) {
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
