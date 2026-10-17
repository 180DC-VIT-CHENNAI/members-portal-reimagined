import { type FormEvent, useState } from 'react';
import { Button, Dialog, ProblemAlert, SelectField, TextAreaField, TextField } from '../ui.tsx';
import { api, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import type { Candidate, Task } from '../../lib/project-client.ts';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
export const PRIORITY_TONE: Record<Priority, string> = { low: '', normal: '', high: 'badge-warning', urgent: 'badge-error' };

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

export function NewTask({ projectId, assignable, onAdded }: { projectId: string; assignable: Candidate[]; onAdded: () => void }) {
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

export function TaskEditor({
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
