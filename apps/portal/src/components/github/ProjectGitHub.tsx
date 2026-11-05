import { useId, useState } from 'react';
import { useLoad } from '../../lib/api.ts';
import { relativeTime } from '../../lib/format.ts';
import { github } from '../../lib/github-client.ts';
import { canWriteTo, issuePath, itemRef, repositoryProblems } from '../../lib/github-view.ts';
import { Link } from '../../lib/router.tsx';
import { useSession } from '../../lib/session.tsx';
import type { IssueWriteResponse } from '../../server/github/types.ts';
import { Alert, Button, Card, ErrorState } from '../ui.tsx';
import { ActivityFeed } from './ActivityFeed.tsx';
import { CreateIssueDialog } from './CreateIssueDialog.tsx';
import { GitHubBoard } from './GitHubBoard.tsx';
import { MilestoneList } from './MilestoneProgress.tsx';
import { type Flash, FlashAlert } from './parts.tsx';
import { PullList } from './PullList.tsx';

type View = 'board' | 'pulls' | 'milestones' | 'activity';

const VIEWS: readonly { readonly value: View; readonly label: string }[] = [
  { value: 'board', label: 'Board' },
  { value: 'pulls', label: 'Pull requests' },
  { value: 'milestones', label: 'Milestones' },
  { value: 'activity', label: 'Activity' },
];

export function ProjectGitHub({ projectId }: { projectId: string }) {
  const { can } = useSession();
  const info = useLoad(() => github.project(projectId), [projectId]);
  const [view, setView] = useState<View>('board');
  const [creating, setCreating] = useState(false);
  const [version, setVersion] = useState(0);
  const [flash, setFlash] = useState<Flash | null>(null);
  const group = useId();

  const data = info.data;
  if (!data) {
    if (!info.problem || info.problem.status === 403 || info.problem.status === 404) return null;
    return (
      <Card title="GitHub">
        <ErrorState problem={info.problem} onRetry={info.reload} />
      </Card>
    );
  }

  if (!data.configured || data.repositories.length === 0) {
    if (!can('github.manage', null)) return null;
    return (
      <Card title="GitHub" description={data.configured ? 'No repository is mapped to this project yet.' : 'The portal is not connected to GitHub yet.'}>
        <Link to="/admin/github" className="text-link">
          Open the GitHub settings
        </Link>
      </Card>
    );
  }

  const canWrite = data.access.write && data.repositories.some(canWriteTo);
  const problems = repositoryProblems(data.repositories);
  const syncTimes = data.repositories.map((repository) => repository.lastSyncedAt);
  const oldest = syncTimes.every((time): time is string => time !== null) ? [...syncTimes].sort()[0] : null;
  const count = data.repositories.length;
  const description = `${count} ${count === 1 ? 'repository' : 'repositories'} · ${oldest ? `synced ${relativeTime(oldest)}` : 'not fully synced yet'}`;

  const created = (response: IssueWriteResponse, notes: string[]) => {
    setCreating(false);
    setVersion((current) => current + 1);
    setFlash({
      title: response.replayed ? `${itemRef(response.item)} was already created` : `${itemRef(response.item)} created`,
      notes,
      href: issuePath(response.item.id),
    });
  };

  return (
    <>
      <Card
        flush
        title="GitHub"
        description={description}
        actions={
          <>
            <div className="segmented" role="radiogroup" aria-label="GitHub view">
              {VIEWS.map((option) => (
                <label key={option.value}>
                  <input type="radio" name={group} checked={view === option.value} onChange={() => setView(option.value)} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            {canWrite && (
              <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                New issue
              </Button>
            )}
          </>
        }
      >
        {(flash || problems.length > 0) && (
          <div className="gh-section gh-pad gh-pad-bottom">
            <FlashAlert flash={flash} onDismiss={() => setFlash(null)} />
            {problems.map((problem) => (
              <Alert key={problem.key} tone={problem.tone} title={problem.text} />
            ))}
          </div>
        )}
        <div className="gh-pad-bottom">
          {view === 'board' && (
            <GitHubBoard projectId={projectId} info={data} canWrite={canWrite} refreshKey={version} onCreate={() => setCreating(true)} onFlash={setFlash} />
          )}
          {view === 'pulls' && <PullList key={version} projectId={projectId} info={data} />}
          {view === 'milestones' && <MilestoneList key={version} projectId={projectId} info={data} />}
          {view === 'activity' && <ActivityFeed key={version} projectId={projectId} info={data} />}
        </div>
      </Card>
      {creating && <CreateIssueDialog projectId={projectId} info={data} onClose={() => setCreating(false)} onCreated={created} />}
    </>
  );
}
