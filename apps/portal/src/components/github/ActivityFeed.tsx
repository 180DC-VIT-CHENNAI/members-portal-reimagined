import { useState } from 'react';
import { useLoad } from '../../lib/api.ts';
import { relativeTime } from '../../lib/format.ts';
import { github } from '../../lib/github-client.ts';
import { activityRef, activityText, issuePath } from '../../lib/github-view.ts';
import { Link } from '../../lib/router.tsx';
import type { ActivityView, ProjectGitHubResponse } from '../../server/github/types.ts';
import { Button, EmptyState, ErrorState, LoadingBlock, ProblemAlert } from '../ui.tsx';
import { useAction } from './use-action.ts';

export function ActivityFeed({ projectId, info }: { projectId: string; info: ProjectGitHubResponse }) {
  const first = useLoad(() => github.activity(projectId), [projectId]);
  const [older, setOlder] = useState<ActivityView[]>([]);
  const [cursor, setCursor] = useState<number | null | undefined>(undefined);
  const more = useAction();

  if (!first.data) {
    return <div className="gh-pad">{first.problem ? <ErrorState problem={first.problem} onRetry={first.reload} /> : <LoadingBlock rows={3} label="Loading activity" />}</div>;
  }
  const rows = [...first.data.activity, ...older];
  const next = cursor === undefined ? first.data.nextBefore : cursor;

  const loadOlder = async () => {
    if (next === null) return;
    const result = await more.run('older', () => github.activity(projectId, next));
    if (!result.ok) return;
    setOlder((previous) => [...previous, ...result.value.activity]);
    setCursor(result.value.nextBefore);
  };

  if (rows.length === 0) {
    return (
      <div className="gh-pad">
        <EmptyState icon="history" title="No activity yet">
          Changes to issues and pull requests in the mapped repositories appear here.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="gh-section gh-pad">
      <ul className="gh-timeline">
        {rows.map((row) => {
          const ref = activityRef(row.issueId, info.repositories);
          return (
            <li key={row.id}>
              <span className="wrap-anywhere">
                {activityText(row)}
                {ref && row.issueId && (
                  <>
                    {' '}
                    <Link to={issuePath(row.issueId)} className="text-link">
                      {ref}
                    </Link>
                  </>
                )}
              </span>
              <span className="caption muted">{relativeTime(row.occurredAt)}</span>
            </li>
          );
        })}
      </ul>
      <ProblemAlert problem={more.problem} />
      {next !== null && (
        <div>
          <Button busy={more.busy === 'older'} onClick={() => void loadOlder()}>
            Show older activity
          </Button>
        </div>
      )}
    </div>
  );
}
