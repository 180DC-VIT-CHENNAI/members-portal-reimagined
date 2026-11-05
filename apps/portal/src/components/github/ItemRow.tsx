import { relativeTime } from '../../lib/format.ts';
import { checkPresentation, issuePath, itemRef, reviewPresentation, stateOf, userLabel } from '../../lib/github-view.ts';
import { Link } from '../../lib/router.tsx';
import type { IssueCard, MyWorkItem } from '../../server/github/types.ts';
import { AssigneeStack, DueTag, LabelList, ToneBadge } from './parts.tsx';

export function ItemRow({ item }: { item: IssueCard | MyWorkItem }) {
  const project = 'project' in item ? item.project : null;
  const open = item.state === 'open';
  const review = item.pull && open ? reviewPresentation(item.pull.reviewDecision) : null;
  return (
    <li className="gh-row">
      <div className="gh-row-main">
        <Link to={issuePath(item.id)} className="gh-row-title">
          {item.title}
        </Link>
        <div className="gh-row-meta">
          <span className="gh-ref">{itemRef(item)}</span>
          <ToneBadge presentation={stateOf(item)} />
          {item.author && <span className="gh-meta">by {userLabel(item.author)}</span>}
          {project && (
            <Link to={`/projects/${project.id}`} className="text-link">
              {project.name}
            </Link>
          )}
          <span className="gh-meta">Updated {relativeTime(item.updatedAt)}</span>
        </div>
        <LabelList labels={item.labels} />
      </div>
      <div className="gh-row-side">
        {item.pull && open && <ToneBadge presentation={checkPresentation(item.pull.checkStatus)} />}
        {review && <ToneBadge presentation={review} />}
        <DueTag item={item} />
        <AssigneeStack users={item.assignees} />
      </div>
    </li>
  );
}
