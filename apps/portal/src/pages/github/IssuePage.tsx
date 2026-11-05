import { useState } from 'react';
import { CommentThread } from '../../components/github/CommentThread.tsx';
import { AssigneesDialog, EditIssueDialog, LabelsDialog, StateDialog } from '../../components/github/IssueDialogs.tsx';
import { AssigneeStack, DueTag, ExternalLink, type Flash, FlashAlert, LabelList, LinkedItems, MilestoneTag, ToneBadge } from '../../components/github/parts.tsx';
import { useAction } from '../../components/github/use-action.ts';
import { Icon } from '../../components/icons.tsx';
import { Alert, BackLink, Button, Card, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField } from '../../components/ui.tsx';
import { useLoad } from '../../lib/api.ts';
import { relativeTime } from '../../lib/format.ts';
import { github, takeWriteNotes } from '../../lib/github-client.ts';
import {
  activityText,
  canWriteTo,
  checkPresentation,
  checkResult,
  columnTitle,
  itemRef,
  parseColumn,
  reviewPresentation,
  stateOf,
  userLabel,
} from '../../lib/github-view.ts';
import { BOARD_COLUMNS, type BoardColumn, type IssueDetail, type IssueWriteResponse, type ProjectGitHubResponse } from '../../server/github/types.ts';

type DialogName = 'edit' | 'assignees' | 'labels' | 'state';

const NONE = <span className="muted">None</span>;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function IssueView({ issue, reload, loading }: { issue: IssueDetail; reload: () => void; loading: boolean }) {
  const [dialog, setDialog] = useState<DialogName | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [stale, setStale] = useState(false);
  const move = useAction();
  const info = useLoad(async (): Promise<ProjectGitHubResponse | null> => (issue.access.write ? github.project(issue.project.id) : null), [issue.project.id, issue.access.write]);

  const isPull = issue.kind === 'pull';
  const repository = info.data?.repositories.find((candidate) => candidate.id === issue.repository.id);
  const writable = issue.access.write && canWriteTo(repository);
  const lockedBecause = repository?.removed ? 'The portal lost access to this repository, so this item is read-only.' : repository?.archived ? 'This repository is archived on GitHub, so this item is read-only.' : null;

  const saved = (title: string) => (response: IssueWriteResponse) => {
    setDialog(null);
    setStale(false);
    setFlash({ title, notes: takeWriteNotes(response) });
    reload();
  };
  const conflict = () => {
    setDialog(null);
    setStale(true);
    reload();
  };
  const moveTo = async (column: BoardColumn) => {
    const result = await move.run('move', () => github.moveIssue(issue.id, column, issue.version));
    if (result.ok) saved(`Moved to ${columnTitle(column)}`)(result.value);
    else if (result.problem.code === 'issue_changed') conflict();
  };
  const closeDialog = () => setDialog(null);

  const pull = issue.pull;
  const review = pull ? reviewPresentation(pull.reviewDecision) : null;

  return (
    <div className="page">
      <BackLink to={`/projects/${issue.project.id}`}>{issue.project.name}</BackLink>
      <PageHeader
        overline={itemRef(issue, true)}
        title={issue.title}
        lede={
          <>
            <ToneBadge presentation={stateOf(issue)} />{' '}
            {`Opened ${relativeTime(issue.createdAt)}${issue.author ? ` by ${userLabel(issue.author)}` : ''}${issue.closedAt ? ` · Closed ${relativeTime(issue.closedAt)}` : ''}`}
          </>
        }
        actions={
          <>
            <Button icon="history" onClick={reload} busy={loading}>
              Refresh
            </Button>
            <ExternalLink href={issue.htmlUrl} className="btn btn-secondary">
              <Icon name="externalLink" size={18} />
              Open on GitHub
            </ExternalLink>
          </>
        }
      />
      <div className="stack">
        <FlashAlert flash={flash} onDismiss={() => setFlash(null)} />
        {stale && (
          <Alert tone="warning" title="This item changed while you were working on it.">
            The latest version is shown below. Make your change again if it still applies.
          </Alert>
        )}
        {issue.access.write && lockedBecause && <Alert tone="warning" title={lockedBecause} />}
        {issue.access.write && info.problem && <Alert tone="warning" title="Editing is unavailable right now.">{info.problem.message}</Alert>}
        <div className="gh-issue">
          <div className="gh-issue-main">
            <Card title="Description">
              {issue.body?.trim() ? <p className="gh-body">{issue.body}</p> : <p className="muted">No description.</p>}
            </Card>
            {isPull && pull && (
              <Card title="Checks" description={checkPresentation(pull.checkStatus).label}>
                {issue.checks.length === 0 ? (
                  <p className="muted">No checks have reported on the latest commit.</p>
                ) : (
                  <ul className="gh-checks">
                    {issue.checks.map((check) => (
                      <li key={`${check.source}:${check.name}`}>
                        <ExternalLink href={check.detailsUrl} className="wrap-anywhere">
                          {check.name}
                        </ExternalLink>
                        <ToneBadge presentation={checkResult(check)} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
            {issue.links.length > 0 && (
              <Card title={isPull ? 'Closes' : 'Linked pull requests'}>
                <LinkedItems links={issue.links} repository={issue.repository.fullName} />
              </Card>
            )}
            <CommentThread
              issue={issue}
              canComment={writable}
              onPosted={(notes) => {
                setFlash({ title: 'Comment posted', notes });
                reload();
              }}
              onRefresh={reload}
            />
            {issue.activity.length > 0 && (
              <Card title="Activity">
                <ul className="gh-timeline">
                  {issue.activity.map((row) => (
                    <li key={row.id}>
                      <span className="wrap-anywhere">{activityText(row)}</span>
                      <span className="caption muted">{relativeTime(row.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <aside className="gh-issue-aside" aria-label="Details">
            <Card title="Details">
              <dl className="gh-facts">
                <Fact label="Status">
                  <span className="cluster">
                    <ToneBadge presentation={stateOf(issue)} />
                    {!isPull && <span>{columnTitle(issue.column)}</span>}
                  </span>
                </Fact>
                <Fact label="Assignees">
                  {issue.assignees.length === 0 ? (
                    NONE
                  ) : (
                    <span className="stack-sm">
                      <AssigneeStack users={issue.assignees} max={6} />
                      <span>{issue.assignees.map(userLabel).join(', ')}</span>
                    </span>
                  )}
                </Fact>
                <Fact label="Labels">{issue.labels.length === 0 ? NONE : <LabelList labels={issue.labels} max={20} />}</Fact>
                <Fact label="Milestone">{issue.milestone ? <MilestoneTag milestone={issue.milestone} /> : NONE}</Fact>
                <Fact label="Due">{issue.effectiveDueDate ? <DueTag item={issue} bare /> : NONE}</Fact>
                {pull && (
                  <>
                    <Fact label="Branch">{pull.headRef && pull.baseRef ? `${pull.headRef} → ${pull.baseRef}` : NONE}</Fact>
                    <Fact label="Review">{review ? <ToneBadge presentation={review} /> : NONE}</Fact>
                    {pull.requestedReviewers.length > 0 && <Fact label="Review requested from">{pull.requestedReviewers.map(userLabel).join(', ')}</Fact>}
                  </>
                )}
                <Fact label="Repository">{issue.repository.fullName}</Fact>
              </dl>
            </Card>
            {isPull && <p className="caption muted">Pull requests are read-only here apart from comments. Review and merge them on GitHub.</p>}
            {!isPull && writable && info.data && (
              <Card title="Actions">
                <div className="stack-sm">
                  <SelectField
                    label="Move to"
                    value={issue.column}
                    disabled={move.busy !== null}
                    onChange={(event) => {
                      const column = parseColumn(event.target.value);
                      if (column && column !== issue.column) void moveTo(column);
                    }}
                  >
                    {BOARD_COLUMNS.map((column) => (
                      <option key={column} value={column}>
                        {columnTitle(column)}
                      </option>
                    ))}
                  </SelectField>
                  <ProblemAlert problem={move.problem} />
                  <Button icon="pencil" onClick={() => setDialog('edit')}>
                    Edit details
                  </Button>
                  <Button icon="users" onClick={() => setDialog('assignees')}>
                    Change assignees
                  </Button>
                  <Button icon="clipboard" onClick={() => setDialog('labels')}>
                    Change labels
                  </Button>
                  <Button icon={issue.state === 'open' ? 'checkCircle' : 'history'} onClick={() => setDialog('state')}>
                    {issue.state === 'open' ? 'Close issue' : 'Reopen issue'}
                  </Button>
                </div>
              </Card>
            )}
          </aside>
        </div>
      </div>
      {info.data && dialog === 'edit' && <EditIssueDialog issue={issue} info={info.data} onClose={closeDialog} onSaved={saved('Issue updated')} onStale={conflict} />}
      {info.data && dialog === 'assignees' && <AssigneesDialog issue={issue} info={info.data} onClose={closeDialog} onSaved={saved('Assignees updated')} onStale={conflict} />}
      {info.data && dialog === 'labels' && <LabelsDialog issue={issue} info={info.data} onClose={closeDialog} onSaved={saved('Labels updated')} onStale={conflict} />}
      {dialog === 'state' && <StateDialog issue={issue} onClose={closeDialog} onSaved={saved(issue.state === 'open' ? 'Issue closed' : 'Issue reopened')} onStale={conflict} />}
    </div>
  );
}

function IssueLoader({ id }: { id: string }) {
  const issue = useLoad(() => github.issue(id), [id]);
  if (!issue.data) {
    return (
      <div className="page">
        <BackLink to="/projects">Projects</BackLink>
        <Card flush>{issue.problem ? <ErrorState problem={issue.problem} onRetry={issue.reload} /> : <LoadingBlock rows={6} label="Loading issue" />}</Card>
      </div>
    );
  }
  return <IssueView issue={issue.data} reload={issue.reload} loading={issue.loading} />;
}

/** One synced issue or pull request, with the forms to change it. */
export function IssuePage({ id }: { id: string }) {
  return <IssueLoader key={id} id={id} />;
}
