import { columnTitle, issuePath, itemRef, parseColumn, stateOf } from '../../lib/github-view.ts';
import { Link } from '../../lib/router.tsx';
import { BOARD_COLUMNS, type BoardColumn, type IssueCard } from '../../server/github/types.ts';
import { Icon } from '../icons.tsx';
import { cx, SelectField } from '../ui.tsx';
import { AssigneeStack, DueTag, LabelList, LinkedItems, MilestoneTag, ToneBadge } from './parts.tsx';

export type ReadOnlyReason = 'archived' | 'removed';

const READ_ONLY_BADGE = {
  archived: { label: 'Archived', tone: 'neutral' },
  removed: { label: 'Access lost', tone: 'error' },
} as const;

interface IssueCardViewProps {
  readonly card: IssueCard;
  readonly canMove: boolean;
  /** This card's move is in flight. */
  readonly moving: boolean;
  /** Some card's move is in flight: one at a time, so the version each move sends stays current. */
  readonly busy: boolean;
  readonly readOnly: ReadOnlyReason | null;
  readonly onMove: (card: IssueCard, column: BoardColumn) => void;
}

export function IssueCardView({ card, canMove, moving, busy, readOnly, onMove }: IssueCardViewProps) {
  const ref = itemRef(card);
  return (
    <li className={cx('gh-card', moving && 'is-moving')} aria-busy={moving || undefined}>
      <div className="gh-card-head">
        <span className="gh-ref">{ref}</span>
        {readOnly && <ToneBadge presentation={READ_ONLY_BADGE[readOnly]} />}
        {card.state === 'closed' && card.stateReason === 'not_planned' && <ToneBadge presentation={stateOf(card)} />}
      </div>
      <Link to={issuePath(card.id)} className="gh-card-title">
        {card.title}
      </Link>
      <LabelList labels={card.labels} />
      {(card.milestone || card.effectiveDueDate) && (
        <div className="gh-card-meta">
          <MilestoneTag milestone={card.milestone} />
          <DueTag item={card} />
        </div>
      )}
      <LinkedItems links={card.links} repository={card.repository.fullName} limit={2} />
      <div className="gh-card-foot">
        <AssigneeStack users={card.assignees} />
        {card.commentCount > 0 && (
          <span className="gh-meta">
            <Icon name="messageSquare" size={14} />
            <span className="visually-hidden">Comments: </span>
            {card.commentCount}
          </span>
        )}
      </div>
      {canMove && !readOnly && (
        <SelectField
          className="gh-move"
          label={
            <>
              Move <span className="visually-hidden">{ref} </span>to
            </>
          }
          value={card.column}
          disabled={busy}
          onChange={(event) => {
            const column = parseColumn(event.target.value);
            if (column && column !== card.column) onMove(card, column);
          }}
        >
          {BOARD_COLUMNS.map((column) => (
            <option key={column} value={column}>
              {columnTitle(column)}
            </option>
          ))}
        </SelectField>
      )}
    </li>
  );
}
