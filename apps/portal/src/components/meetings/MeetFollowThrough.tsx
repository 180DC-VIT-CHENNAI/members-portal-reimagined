import { type FormEvent, useState } from 'react';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { loadProject } from '../../lib/project-client.ts';
import { Link } from '../../lib/router.tsx';
import { Button, ProblemAlert, SelectField, TextAreaField } from '../ui.tsx';

export interface FollowThroughMeet {
  readonly id: string;
  readonly title: string;
  readonly agenda: string | null;
  readonly notes: string | null;
  readonly actionItems: ReadonlyArray<{
    readonly taskId: string;
    readonly projectId: string;
    readonly projectName: string;
    readonly title: string;
    readonly status: string;
  }>;
}

/** A meet's agenda, notes and linked project tasks; editable by whoever manages the meet. */
export function MeetFollowThrough({ meet, manage, onChanged }: { meet: FollowThroughMeet; manage: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const unlink = async (taskId: string) => {
    setBusy(taskId);
    setProblem(null);
    try {
      await api('/api/meets/:id/action-items/:taskId', { method: 'DELETE', params: { id: meet.id, taskId } });
      onChanged();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(null);
    }
  };

  const empty = !meet.agenda && !meet.notes && meet.actionItems.length === 0;
  if (empty && !manage) return null;

  return (
    <div className="stack-sm">
      {editing ? (
        <EditFollowThrough
          meet={meet}
          onDone={(saved) => {
            setEditing(false);
            if (saved) onChanged();
          }}
        />
      ) : (
        <>
          {meet.agenda && (
            <div>
              <strong className="caption">Agenda</strong>
              <p className="pre-wrap">{meet.agenda}</p>
            </div>
          )}
          {meet.notes && (
            <div>
              <strong className="caption">Notes</strong>
              <p className="pre-wrap">{meet.notes}</p>
            </div>
          )}
        </>
      )}
      {meet.actionItems.length > 0 && (
        <div>
          <strong className="caption">Action items</strong>
          <ul className="stack-sm">
            {meet.actionItems.map((item) => (
              <li key={item.taskId} className="cluster">
                <Link to={`/projects/${item.projectId}`}>{item.title}</Link>
                <span className="caption muted">{item.projectName}</span>
                <span className="badge">{item.status}</span>
                {manage && (
                  <Button size="sm" variant="danger-quiet" icon="trash" busy={busy === item.taskId} onClick={() => unlink(item.taskId)}>
                    Unlink
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ProblemAlert problem={problem} />
      {manage && linking && (
        <LinkTask
          meetId={meet.id}
          linked={meet.actionItems.map((item) => item.taskId)}
          onDone={(linked) => {
            setLinking(false);
            if (linked) onChanged();
          }}
        />
      )}
      {manage && !editing && !linking && (
        <div className="cluster">
          <Button size="sm" icon="pencil" onClick={() => setEditing(true)}>
            {meet.agenda || meet.notes ? 'Edit agenda and notes' : 'Add agenda and notes'}
          </Button>
          <Button size="sm" icon="plus" onClick={() => setLinking(true)}>
            Link a task
          </Button>
        </div>
      )}
    </div>
  );
}

function EditFollowThrough({ meet, onDone }: { meet: FollowThroughMeet; onDone: (saved: boolean) => void }) {
  const [agenda, setAgenda] = useState(meet.agenda ?? '');
  const [notes, setNotes] = useState(meet.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/meets/:id', { method: 'PATCH', params: { id: meet.id }, body: { agenda: agenda.trim() || null, notes: notes.trim() || null } });
      onDone(true);
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <TextAreaField label="Agenda" optional value={agenda} onChange={(e) => setAgenda(e.target.value)} error={problem?.fields.agenda} rows={3} maxLength={5000} />
      <TextAreaField label="Notes" optional value={notes} onChange={(e) => setNotes(e.target.value)} error={problem?.fields.notes} rows={5} maxLength={10000} />
      <ProblemAlert problem={problem} fieldsShown={['agenda', 'notes']} />
      <div className="form-actions">
        <Button disabled={busy} onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** Pick a task from a project the caller can see; the server checks both rights again. */
function LinkTask({ meetId, linked, onDone }: { meetId: string; linked: readonly string[]; onDone: (linked: boolean) => void }) {
  const projects = useLoad(() => api('/api/projects'), []);
  const [projectId, setProjectId] = useState('');
  const project = useLoad(() => (projectId ? loadProject(projectId) : Promise.resolve(null)), [projectId]);
  const [taskId, setTaskId] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const tasks = (project.data?.tasks ?? []).filter((task) => !linked.includes(task.id));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/meets/:id/action-items', { method: 'POST', params: { id: meetId }, body: { projectId, taskId } });
      onDone(true);
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <SelectField
          label="Project"
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setTaskId('');
          }}
        >
          <option value="">{projects.data ? 'Choose a project' : 'Loading projects'}</option>
          {(projects.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Task" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!projectId}>
          <option value="">{projectId && !project.data ? 'Loading tasks' : 'Choose a task'}</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </SelectField>
      </div>
      <ProblemAlert problem={problem ?? projects.problem ?? project.problem} />
      <div className="form-actions">
        <Button disabled={busy} onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" icon="plus" busy={busy} disabled={!projectId || !taskId}>
          Link task
        </Button>
      </div>
    </form>
  );
}
