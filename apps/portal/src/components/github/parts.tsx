import type { CSSProperties, ReactNode } from 'react';
import { formatDate, isHttpsUrl } from '../../lib/format.ts';
import {
  issuePath,
  labelColor,
  linkedRef,
  linkedState,
  toneClass,
  userLabel,
  visibleLabels,
  type Presentation,
} from '../../lib/github-view.ts';
import { Link } from '../../lib/router.tsx';
import type { GitHubUserRef, IssueCard, LabelView, LinkedItemRef, MilestoneView } from '../../server/github/types.ts';
import { Icon } from '../icons.tsx';
import { Alert, Avatar, Button, cx } from '../ui.tsx';
import './github.css';

export function ToneBadge({ presentation, className }: { presentation: Presentation; className?: string }) {
  return (
    <span className={cx('badge', toneClass(presentation.tone), className)}>
      <span className="badge-dot" aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

export function ExternalLink({ href, children, className }: { href: string | null | undefined; children: ReactNode; className?: string }) {
  if (!isHttpsUrl(href)) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

export function LabelChip({ label }: { label: Pick<LabelView, 'name' | 'color'> }) {
  const color = labelColor(label.color);
  return (
    <span className="gh-label" style={color ? ({ '--gh-label': color } as CSSProperties) : undefined}>
      {label.name}
    </span>
  );
}

export function LabelList({ labels, max = 3 }: { labels: readonly LabelView[]; max?: number }) {
  const shown = visibleLabels(labels);
  if (shown.length === 0) return null;
  const hidden = shown.slice(max);
  return (
    <ul className="gh-labels" aria-label="Labels">
      {shown.slice(0, max).map((label) => (
        <li key={label.id}>
          <LabelChip label={label} />
        </li>
      ))}
      {hidden.length > 0 && (
        <li className="caption muted" title={hidden.map((label) => label.name).join(', ')}>
          +{hidden.length}
          <span className="visually-hidden"> more labels</span>
        </li>
      )}
    </ul>
  );
}

export function AssigneeStack({ users, max = 3, size = 24 }: { users: readonly GitHubUserRef[]; max?: number; size?: number }) {
  if (users.length === 0) return <span className="caption muted">Unassigned</span>;
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="gh-avatars">
      <span className="visually-hidden">Assigned to {users.map(userLabel).join(', ')}</span>
      {shown.map((user) => (
        <span key={user.githubUserId} className="gh-avatar" title={userLabel(user)}>
          <Avatar name={user.person?.fullName ?? user.login} photo={user.person?.photoKey} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span className="gh-avatar-more" aria-hidden="true">
          +{rest}
        </span>
      )}
    </span>
  );
}

export function DueTag({ item, bare = false }: { item: Pick<IssueCard, 'effectiveDueDate' | 'overdue'>; bare?: boolean }) {
  if (!item.effectiveDueDate) return null;
  return (
    <span className={cx('gh-due', item.overdue && 'is-overdue')}>
      <Icon name="calendar" size={14} />
      {item.overdue ? (
        <>
          <strong>Overdue</strong> · {formatDate(item.effectiveDueDate)}
        </>
      ) : (
        `${bare ? '' : 'Due '}${formatDate(item.effectiveDueDate)}`
      )}
    </span>
  );
}

export function MilestoneTag({ milestone }: { milestone: MilestoneView | null }) {
  if (!milestone) return null;
  return (
    <span className="gh-meta" title={milestone.state === 'closed' ? 'Closed milestone' : 'Milestone'}>
      <Icon name="trophy" size={14} />
      {milestone.title}
    </span>
  );
}

export function LinkedItems({ links, repository, limit }: { links: readonly LinkedItemRef[]; repository: string; limit?: number }) {
  if (links.length === 0) return null;
  const shown = limit ? links.slice(0, limit) : links;
  return (
    <ul className="gh-links" aria-label="Linked work">
      {shown.map((link) => {
        const inner = (
          <>
            <span className="gh-link-ref">
              {link.kind === 'pull' ? 'PR' : 'Issue'} {linkedRef(link, repository)}
            </span>
            <ToneBadge presentation={linkedState(link)} />
          </>
        );
        const key = `${link.repositoryFullName ?? ''}#${link.number}`;
        if (link.id) {
          return (
            <li key={key}>
              <Link to={issuePath(link.id)} className="gh-link">
                {inner}
              </Link>
            </li>
          );
        }
        return (
          <li key={key}>
            <ExternalLink href={link.htmlUrl} className="gh-link">
              {inner}
            </ExternalLink>
          </li>
        );
      })}
      {limit !== undefined && links.length > limit && <li className="caption muted">+{links.length - limit} more</li>}
    </ul>
  );
}

export interface Flash {
  readonly title: string;
  readonly notes: readonly string[];
  readonly href?: string;
}

export function FlashAlert({ flash, onDismiss }: { flash: Flash | null; onDismiss: () => void }) {
  if (!flash) return null;
  return (
    <Alert tone="success" title={flash.title}>
      <div className="stack-sm">
        {flash.notes.length > 0 && (
          <ul>
            {flash.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        <div className="cluster">
          {flash.href && (
            <Link to={flash.href} className="text-link">
              Open it
            </Link>
          )}
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </Alert>
  );
}

export interface CheckOption {
  readonly value: string;
  readonly label: ReactNode;
}

export function CheckList({
  legend,
  options,
  selected,
  max,
  optional,
  empty,
  onChange,
}: {
  legend: string;
  options: readonly CheckOption[];
  selected: readonly string[];
  max?: number;
  optional?: boolean;
  empty: string;
  onChange: (selected: string[]) => void;
}) {
  return (
    <fieldset className="gh-picker-group">
      <legend>
        {legend}
        {optional && <span className="optional"> (optional)</span>}
      </legend>
      {options.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        <div className="gh-picker">
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label key={option.value} className="check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && max !== undefined && selected.length >= max}
                  onChange={() => onChange(checked ? selected.filter((value) => value !== option.value) : [...selected, option.value])}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
