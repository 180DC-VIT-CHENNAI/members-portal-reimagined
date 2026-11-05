import { type FormEvent, useId, useState } from 'react';
import { formatDate } from '../../lib/format.ts';
import { github } from '../../lib/github-client.ts';
import { issueDraft, issuePatch, itemRef, labelChanges, visibleLabels } from '../../lib/github-view.ts';
import { GITHUB_LIMITS, type IssueDetail, type IssueWriteResponse, type LabelView, type ProjectGitHubResponse } from '../../server/github/types.ts';
import { Button, Dialog, ProblemAlert, SelectField, TextAreaField, TextField } from '../ui.tsx';
import { CheckList, LabelChip } from './parts.tsx';
import { useAction } from './use-action.ts';

export interface IssueDialogProps {
  readonly issue: IssueDetail;
  readonly info: ProjectGitHubResponse;
  readonly onClose: () => void;
  readonly onSaved: (response: IssueWriteResponse) => void;
  readonly onStale: () => void;
}

function useWrite({ onClose, onSaved, onStale }: Pick<IssueDialogProps, 'onClose' | 'onSaved' | 'onStale'>) {
  const { busy, problem, run } = useAction();
  const working = busy !== null;

  const submit = async (write: () => Promise<IssueWriteResponse>) => {
    if (working) return;
    const result = await run('save', write);
    if (result.ok) onSaved(result.value);
    else if (result.problem.code === 'issue_changed') onStale();
  };
  const close = () => {
    if (!working) onClose();
  };
  return { working, problem, submit, close };
}

function DialogFooter({ working, disabled, submitLabel, onClose }: { working: boolean; disabled: boolean; submitLabel: string; onClose: () => void }) {
  return (
    <div className="dialog-actions">
      <Button onClick={onClose} disabled={working}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" busy={working} disabled={disabled}>
        {submitLabel}
      </Button>
    </div>
  );
}

export function EditIssueDialog({ issue, info, onClose, onSaved, onStale }: IssueDialogProps) {
  const current = issueDraft(issue);
  const [title, setTitle] = useState(current.title);
  const [body, setBody] = useState(current.body);
  const [milestone, setMilestone] = useState(current.milestoneNumber === null ? '' : String(current.milestoneNumber));
  const [dueDate, setDueDate] = useState(current.dueDate ?? '');
  const { working, problem, submit, close } = useWrite({ onClose, onSaved, onStale });

  const repository = info.repositories.find((candidate) => candidate.id === issue.repository.id);
  const milestones = (repository?.milestones ?? []).filter((candidate) => candidate.state === 'open' || candidate.number === current.milestoneNumber);
  const patch = issuePatch(current, { title: title.trim(), body, milestoneNumber: milestone ? Number(milestone) : null, dueDate: dueDate || null }, issue.version);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (patch) void submit(() => github.updateIssue(issue.id, patch));
  };

  return (
    <Dialog open title={`Edit ${itemRef(issue)}`} onClose={close}>
      <form className="gh-dialog-form" onSubmit={save}>
        <TextField
          label="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={GITHUB_LIMITS.titleLength}
          error={problem?.fields.title}
          autoFocus
        />
        <TextAreaField
          label="Description"
          optional
          hint="Plain text. GitHub shows it as Markdown."
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={GITHUB_LIMITS.bodyLength}
          rows={8}
          error={problem?.fields.body}
        />
        <div className="form-grid">
          <SelectField label="Milestone" optional value={milestone} onChange={(event) => setMilestone(event.target.value)}>
            <option value="">No milestone</option>
            {milestones.map((candidate) => (
              <option key={candidate.id} value={String(candidate.number)}>
                {candidate.title}
                {candidate.dueOn ? ` (due ${formatDate(candidate.dueOn)})` : ''}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Due date"
            optional
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            hint="Kept in the portal; GitHub issues have no due date. Without one, the milestone's date is used."
            error={problem?.fields.dueDate}
          />
        </div>
        <ProblemAlert problem={problem} fieldsShown={['title', 'body', 'dueDate']} />
        <DialogFooter working={working} disabled={!patch || title.trim() === ''} submitLabel="Save changes" onClose={close} />
      </form>
    </Dialog>
  );
}

export function AssigneesDialog({ issue, info, onClose, onSaved, onStale }: IssueDialogProps) {
  const linked = issue.assignees.flatMap((user) => (user.person ? [user.person.id] : []));
  const unlinked = issue.assignees.filter((user) => !user.person);
  const [selected, setSelected] = useState<string[]>(linked);
  const { working, problem, submit, close } = useWrite({ onClose, onSaved, onStale });

  const options = new Map<string, string>();
  for (const user of [...info.assignable, ...issue.assignees]) {
    if (user.person && !options.has(user.person.id)) options.set(user.person.id, `${user.person.fullName} (@${user.login})`);
  }
  const unchanged = selected.length === linked.length && selected.every((id) => linked.includes(id));

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!unchanged) void submit(() => github.setAssignees(issue.id, { personIds: selected, expectedVersion: issue.version }));
  };

  return (
    <Dialog open title={`Assignees for ${itemRef(issue)}`} onClose={close}>
      <form className="gh-dialog-form" onSubmit={save}>
        <CheckList
          legend="Assignees"
          options={[...options].map(([value, label]) => ({ value, label }))}
          selected={selected}
          max={GITHUB_LIMITS.assigneesPerIssue}
          empty="No linked members can see this project yet."
          onChange={setSelected}
        />
        {unlinked.length > 0 && (
          <p className="hint">Also assigned on GitHub but not linked to a member: {unlinked.map((user) => `@${user.login}`).join(', ')}. They stay assigned.</p>
        )}
        <ProblemAlert problem={problem} />
        <DialogFooter working={working} disabled={unchanged} submitLabel="Save assignees" onClose={close} />
      </form>
    </Dialog>
  );
}

export function LabelsDialog({ issue, info, onClose, onSaved, onStale }: IssueDialogProps) {
  const current = visibleLabels(issue.labels);
  const currentNames = current.map((label) => label.name);
  const [selected, setSelected] = useState<string[]>(currentNames);
  const { working, problem, submit, close } = useWrite({ onClose, onSaved, onStale });

  const repository = info.repositories.find((candidate) => candidate.id === issue.repository.id);
  const known = new Map<string, LabelView>();
  for (const label of [...visibleLabels(repository?.labels ?? []), ...current]) {
    if (!known.has(label.name)) known.set(label.name, label);
  }
  const changes = labelChanges(currentNames, selected);
  const unchanged = changes.add.length === 0 && changes.remove.length === 0;

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (unchanged) return;
    void submit(() =>
      github.changeLabels(issue.id, {
        ...(changes.add.length > 0 ? { add: changes.add } : {}),
        ...(changes.remove.length > 0 ? { remove: changes.remove } : {}),
        expectedVersion: issue.version,
      }),
    );
  };

  return (
    <Dialog open title={`Labels for ${itemRef(issue)}`} onClose={close}>
      <form className="gh-dialog-form" onSubmit={save}>
        <CheckList
          legend="Labels"
          options={[...known.values()].map((label) => ({ value: label.name, label: <LabelChip label={label} /> }))}
          selected={selected}
          max={GITHUB_LIMITS.labelsPerIssue}
          empty="This repository has no labels besides the board's status labels."
          onChange={setSelected}
        />
        <p className="hint">The board column is set by moving the card, not by a label.</p>
        <ProblemAlert problem={problem} />
        <DialogFooter working={working} disabled={unchanged} submitLabel="Save labels" onClose={close} />
      </form>
    </Dialog>
  );
}

const REASONS = [
  { value: 'completed', label: 'Completed' },
  { value: 'not_planned', label: 'Not planned' },
] as const;

export function StateDialog({ issue, onClose, onSaved, onStale }: Omit<IssueDialogProps, 'info'>) {
  const closing = issue.state === 'open';
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('completed');
  const group = useId();
  const { working, problem, submit, close } = useWrite({ onClose, onSaved, onStale });

  const save = (event: FormEvent) => {
    event.preventDefault();
    void submit(() =>
      github.setState(issue.id, closing ? { state: 'closed', reason, expectedVersion: issue.version } : { state: 'open', expectedVersion: issue.version }),
    );
  };

  return (
    <Dialog open title={`${closing ? 'Close' : 'Reopen'} ${itemRef(issue)}`} onClose={close}>
      <form className="gh-dialog-form" onSubmit={save}>
        {closing ? (
          <fieldset className="gh-picker-group">
            <legend>Reason</legend>
            <div className="stack-sm">
              {REASONS.map((option) => (
                <label key={option.value} className="check">
                  <input type="radio" name={group} checked={reason === option.value} onChange={() => setReason(option.value)} />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <p>This reopens the issue on GitHub and puts it back on the board.</p>
        )}
        <ProblemAlert problem={problem} />
        <DialogFooter working={working} disabled={false} submitLabel={closing ? 'Close issue' : 'Reopen issue'} onClose={close} />
      </form>
    </Dialog>
  );
}
