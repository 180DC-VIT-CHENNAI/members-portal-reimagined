import { useLoad } from '../../lib/api.ts';
import { formatDate } from '../../lib/format.ts';
import { github } from '../../lib/github-client.ts';
import { milestonePercent, recentlyClosed, repoName } from '../../lib/github-view.ts';
import type { MilestoneProgress, ProjectGitHubResponse } from '../../server/github/types.ts';
import { EmptyState, ErrorState, LoadingBlock } from '../ui.tsx';
import { ToneBadge } from './parts.tsx';

function order(a: MilestoneProgress, b: MilestoneProgress): number {
  if (a.milestone.state !== b.milestone.state) return a.milestone.state === 'open' ? -1 : 1;
  const due = (a.milestone.dueOn ?? '\uffff').localeCompare(b.milestone.dueOn ?? '\uffff');
  return due || a.milestone.title.localeCompare(b.milestone.title);
}

export function MilestoneList({ projectId, info }: { projectId: string; info: ProjectGitHubResponse }) {
  const data = useLoad(() => github.milestones(projectId), [projectId]);
  if (!data.data) {
    return <div className="gh-pad">{data.problem ? <ErrorState problem={data.problem} onRetry={data.reload} /> : <LoadingBlock rows={2} label="Loading milestones" />}</div>;
  }
  const milestones = [...data.data.milestones].sort(order);
  if (milestones.length === 0) {
    return (
      <div className="gh-pad">
        <EmptyState icon="trophy" title="No milestones">
          Milestones created in the mapped repositories on GitHub show their progress here.
        </EmptyState>
      </div>
    );
  }
  return (
    <ul className="gh-milestones gh-pad">
      {milestones.map((progress) => {
        const { milestone, open, closed, repositoryId } = progress;
        const total = open + closed;
        const percent = milestonePercent(open, closed);
        const repository = info.repositories.find((candidate) => candidate.id === repositoryId);
        const week = recentlyClosed(progress);
        return (
          <li key={`${repositoryId}-${milestone.id}`} className="gh-milestone">
            <div className="row-between">
              <strong className="wrap-anywhere">{milestone.title}</strong>
              <ToneBadge presentation={milestone.state === 'open' ? { label: 'Open', tone: 'success' } : { label: 'Closed', tone: 'neutral' }} />
            </div>
            <span className="caption muted">
              {repository ? repoName(repository.fullName) : 'Repository'}
              {milestone.dueOn ? ` · Due ${formatDate(milestone.dueOn)}` : ''}
            </span>
            <progress value={closed} max={Math.max(total, 1)} aria-label={`${milestone.title}: ${percent}% done`} />
            <span className="caption">
              {closed} of {total} done ({percent}%)
              {week > 0 ? ` · ${week} closed in the last 7 days` : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
