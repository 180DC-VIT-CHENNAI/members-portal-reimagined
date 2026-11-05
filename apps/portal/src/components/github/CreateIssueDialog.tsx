import { type FormEvent, useState } from 'react';
import { formatDate } from '../../lib/format.ts';
import { github, mintRequestId, takeWriteNotes } from '../../lib/github-client.ts';
import {
  afterFailure,
  attemptFor,
  canWriteTo,
  classifyWriteError,
  columnTitle,
  CREATE_COLUMNS,
  createAnyway,
  issueFingerprint,
  repoName,
  startAttempt,
  visibleLabels,
  type WriteAttempt,
} from '../../lib/github-view.ts';
import { type BoardColumn, type CreateIssueInput, GITHUB_LIMITS, type IssueWriteResponse, type ProjectGitHubResponse } from '../../server/github/types.ts';
import { Alert, Button, Dialog, ProblemAlert, SelectField, TextAreaField, TextField } from '../ui.tsx';
import { CheckList } from './parts.tsx';
import { useAction } from './use-action.ts';

interface CreateIssueDialogProps {
  readonly projectId: string;
  readonly info: ProjectGitHubResponse;
  readonly onClose: () => void;
  readonly onCreated: (response: IssueWriteResponse, notes: string[]) => void;
}

export function CreateIssueDialog({ projectId, info, onClose, onCreated }: CreateIssueDialogProps) {
  const repositories = info.repositories.filter(canWriteTo);
  const [repositoryId, setRepositoryId] = useState(repositories[0]?.id ?? 0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [column, setColumn] = useState<Exclude<BoardColumn, 'done'>>('backlog');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [milestone, setMilestone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [attempt, setAttempt] = useState<WriteAttempt>(() => startAttempt(mintRequestId));
  const { busy, problem, run } = useAction();
  const repository = repositories.find((candidate) => candidate.id === repositoryId);

  const people = info.assignable.flatMap((user) => (user.person ? [{ value: user.person.id, label: `${user.person.fullName} (@${user.login})` }] : []));
  const labelOptions = visibleLabels(repository?.labels ?? []).map((label) => ({ value: label.name, label: label.name }));
  const milestones = (repository?.milestones ?? []).filter((candidate) => candidate.state === 'open');

  const input = (): Omit<CreateIssueInput, 'requestId'> => ({
    repositoryId,
    title: title.trim(),
    column,
    ...(body.trim() ? { body } : {}),
    ...(assignees.length > 0 ? { assigneePersonIds: assignees } : {}),
    ...(labels.length > 0 ? { labels } : {}),
    ...(milestone ? { milestoneNumber: Number(milestone) } : {}),
    ...(dueDate ? { dueDate } : {}),
  });

  const send = async (next: WriteAttempt) => {
    setAttempt(next);
    const result = await run('create', () => github.createIssue(projectId, { ...input(), requestId: next.requestId }));
    if (result.ok) {
      onCreated(result.value, takeWriteNotes(result.value));
      return;
    }
    setAttempt(afterFailure(next, classifyWriteError(result.problem), mintRequestId));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    void send(attemptFor(attempt, issueFingerprint(input()), mintRequestId));
  };

  const close = () => {
    if (!busy) onClose();
  };

  if (repositories.length === 0) {
    return (
      <Dialog open title="New issue" onClose={close}>
        <Alert tone="warning" title="No repository can take new issues.">
          Every repository of this project is archived or the portal has lost access to it.
        </Alert>
        <div className="dialog-actions">
          <Button onClick={close}>Close</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open title="New issue" onClose={close}>
      <form className="gh-dialog-form" onSubmit={submit}>
        <div className="form-grid">
          <SelectField
            label="Repository"
            value={String(repositoryId)}
            onChange={(event) => {
              setRepositoryId(Number(event.target.value));
              setLabels([]);
              setMilestone('');
            }}
          >
            {repositories.map((candidate) => (
              <option key={candidate.id} value={String(candidate.id)}>
                {repoName(candidate.fullName)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Column"
            value={column}
            onChange={(event) => {
              const next = CREATE_COLUMNS.find((candidate) => candidate === event.target.value);
              if (next) setColumn(next);
            }}
          >
            {CREATE_COLUMNS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {columnTitle(candidate)}
              </option>
            ))}
          </SelectField>
        </div>
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
          rows={4}
          error={problem?.fields.body}
        />
        <CheckList
          legend="Assignees"
          optional
          options={people}
          selected={assignees}
          max={GITHUB_LIMITS.assigneesPerIssue}
          empty="No linked members can see this project yet."
          onChange={setAssignees}
        />
        <CheckList
          legend="Labels"
          optional
          options={labelOptions}
          selected={labels}
          max={GITHUB_LIMITS.labelsPerIssue}
          empty="This repository has no labels besides the board's status labels."
          onChange={setLabels}
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
          />
        </div>
        {attempt.unknown && (
          <Alert tone="warning" title="We could not confirm whether GitHub created this issue.">
            Look for it on the board or in the repository on GitHub first. Create it again only if it is not there.
          </Alert>
        )}
        <ProblemAlert problem={problem} fieldsShown={['title', 'body']} />
        <div className="dialog-actions">
          <Button onClick={close} disabled={busy !== null}>
            {attempt.unknown ? 'Close' : 'Cancel'}
          </Button>
          {attempt.unknown ? (
            <Button variant="primary" busy={busy === 'create'} onClick={() => void send(createAnyway(issueFingerprint(input()), mintRequestId))}>
              Create anyway
            </Button>
          ) : (
            <Button type="submit" variant="primary" busy={busy === 'create'} disabled={title.trim() === ''}>
              Create issue
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
