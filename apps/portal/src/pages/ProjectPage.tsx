import { useState } from 'react';
import { BackLink, Button, ConfirmDialog, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField } from '../components/ui.tsx';
import { ProjectTasks } from '../components/projects/ProjectTasks.tsx';
import { ProjectMembers } from '../components/projects/ProjectMembers.tsx';
import { ProjectFiles } from '../components/projects/ProjectFiles.tsx';
import { api, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { formatDate, plural } from '../lib/format.ts';
import { loadProject, loadProjectPeople, type Candidate } from '../lib/project-client.ts';
import { navigate } from '../lib/router.tsx';

/** One project: its details, tasks and people, with the actions the caller may take. */
export function ProjectPage({ id }: { id: string }) {
  const project = useLoad(() => loadProject(id), [id]);
  const access = project.data?.access;
  const picksPeople = Boolean(access && (access.manageMembers || access.manageTasks));
  const people = useLoad(() => (picksPeople ? loadProjectPeople(id) : Promise.resolve<Candidate[]>([])), [id, picksPeople]);
  const [confirm, setConfirm] = useState<'complete' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  if (project.problem) return <ErrorState problem={project.problem} onRetry={project.reload} />;
  const p = project.data;
  if (!p) return <LoadingBlock />;

  const setStatus = async (status: 'active' | 'completed' | 'upcoming' | 'on_hold') => {
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

  const open = p.tasks.filter((t) => t.status !== 'completed').length;
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
              {p.status !== 'completed' ? (
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
          <span className={p.status === 'completed' ? 'badge badge-success' : 'badge'}>{p.status.replace('_', ' ')}</span>
          {p.internal && <span className="badge">Internal</span>}
          <span className="caption muted">{facts}</span>
        </div>
        {p.access.manage && p.status !== 'completed' && (
          <SelectField label="Project stage" value={p.status} disabled={busy} onChange={(event) => {
            const status = event.target.value;
            if (status === 'active' || status === 'upcoming' || status === 'on_hold') void setStatus(status);
          }}>
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
          </SelectField>
        )}
        {p.description && <p className="pre-wrap">{p.description}</p>}
        <ProblemAlert problem={confirm ? null : problem} />
        <ProjectTasks project={p} assignable={(people.data ?? []).filter((c) => c.canSee)} onChange={project.reload} />
        <ProjectFiles project={p} />
        <ProjectMembers
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
        <p>{p.internal ? 'It stays internal and will not appear on the public site.' : 'It will be listed on the public site with its name, client and description.'}</p>
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
          {p.status === 'completed' && !p.internal && ' It also comes off the public site.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}
