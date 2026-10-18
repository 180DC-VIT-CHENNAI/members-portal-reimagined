import { useState } from 'react';
import { Button, Card, ConfirmDialog, ProblemAlert } from '../ui.tsx';
import { api, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDate } from '../../lib/format.ts';
import type { Candidate, Project, Task } from '../../lib/project-client.ts';
import { BlockTask, NewTask, TaskEditor, PRIORITY_LABEL, PRIORITY_TONE } from './TaskForms.tsx';
import { TaskActivity } from './TaskActivity.tsx';

export function ProjectTasks({ project, assignable, onChange }: { project: Project; assignable: Candidate[]; onChange: () => void }) {
  const manage = project.access.manageTasks;
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Task | null>(null);
  const [blocking, setBlocking] = useState<string | null>(null);
  const done = project.tasks.filter((t) => t.status === 'completed').length;
  const blocked = project.tasks.filter((t) => t.status === 'blocked').length;
  const editingTask = project.tasks.find((t) => t.id === editing) ?? null;
  const blockingTask = project.tasks.find((t) => t.id === blocking) ?? null;

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
  const setStatus = (taskId: string, status: 'pending' | 'completed') =>
    act(taskId, () => api('/api/projects/:id/tasks/:taskId/status', { method: 'PUT', params: params(taskId), body: { status } }));

  return (
    <Card
      title="Tasks"
      description={project.tasks.length ? `${done} of ${project.tasks.length} done${blocked ? `, ${blocked} blocked` : ''}.` : 'Nothing to do yet.'}
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
                    aria-label={t.status === 'completed' ? `Reopen "${t.title}"` : `Mark "${t.title}" done`}
                    onChange={() => setStatus(t.id, t.status === 'completed' ? 'pending' : 'completed')}
                  />
                </label>
                <div className="stack-sm">
                  <div className="cluster">
                    <strong className={t.status === 'completed' ? 'task-done' : undefined}>{t.title}</strong>
                    {t.status === 'blocked' && <span className="badge badge-warning">Blocked</span>}
                    {t.priority !== 'normal' && <span className={`badge ${PRIORITY_TONE[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</span>}
                  </div>
                  {t.status === 'blocked' && t.blockedReason && <p className="pre-wrap">Blocked: {t.blockedReason}</p>}
                  {t.description && <p className="pre-wrap">{t.description}</p>}
                  <p className="caption muted">
                    {t.assigneeName ?? 'Unassigned'}
                    {t.dueDate && ` · Due ${formatDate(t.dueDate)}`}
                    {t.completedAt && ` · Done ${formatDate(t.completedAt)}`}
                  </p>
                  {(manage || (t.canUpdateStatus && t.status !== 'completed')) && (
                    <div className="cluster">
                      {t.canUpdateStatus && t.status === 'pending' && (
                        <Button size="sm" icon="alert" onClick={() => { setProblem(null); setBlocking(t.id); }}>
                          Mark blocked
                        </Button>
                      )}
                      {t.canUpdateStatus && t.status === 'blocked' && (
                        <>
                          <Button size="sm" icon="history" busy={busy === t.id} onClick={() => setStatus(t.id, 'pending')}>
                            Unblock
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setProblem(null); setBlocking(t.id); }}>
                            Change reason
                          </Button>
                        </>
                      )}
                      {manage && (
                        <>
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
                        </>
                      )}
                    </div>
                  )}
                  <TaskActivity projectId={project.id} taskId={t.id} count={t.comments} onChange={onChange} />
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
      {blockingTask && (
        <BlockTask
          key={blockingTask.id}
          projectId={project.id}
          task={blockingTask}
          onSaved={() => {
            setBlocking(null);
            onChange();
          }}
          onConflict={onChange}
          onClose={() => setBlocking(null)}
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
