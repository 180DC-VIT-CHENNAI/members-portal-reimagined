import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLoad } from '../../lib/api.ts';
import { github, takeWriteNotes } from '../../lib/github-client.ts';
import {
  type BoardFilters,
  boardQuery,
  boardTotal,
  columnTitle,
  filtersActive,
  itemRef,
  moveCard,
  NO_FILTERS,
  placeCard,
  repoName,
  uniqueLabelNames,
} from '../../lib/github-view.ts';
import { type BoardColumn, GITHUB_LIMITS, type IssueCard, type ProjectGitHubResponse } from '../../server/github/types.ts';
import { Alert, Button, EmptyState, ErrorState, LoadingBlock, ProblemAlert, SearchField, SelectField } from '../ui.tsx';
import { IssueCardView, type ReadOnlyReason } from './IssueCard.tsx';
import type { Flash } from './parts.tsx';
import { useAction } from './use-action.ts';

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface GitHubBoardProps {
  readonly projectId: string;
  readonly info: ProjectGitHubResponse;
  readonly canWrite: boolean;
  /** Bumped by the parent when something was created, so the board reads again. */
  readonly refreshKey: number;
  readonly onCreate: () => void;
  readonly onFlash: (flash: Flash) => void;
}

export function GitHubBoard({ projectId, info, canWrite, refreshKey, onCreate, onFlash }: GitHubBoardProps) {
  const [filters, setFilters] = useState<BoardFilters>(NO_FILTERS);
  const search = useDebounced(filters.q, 300);
  const applied = useMemo<BoardFilters>(() => ({ ...filters, q: search }), [filters, search]);
  const appliedKey = JSON.stringify(boardQuery(applied));
  const board = useLoad(() => github.board(projectId, applied), [projectId, appliedKey, refreshKey]);
  const action = useAction();
  const [moving, setMoving] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const latest = useRef(board.data);
  latest.current = board.data;
  const headings = useId();

  const set = (patch: Partial<BoardFilters>) => setFilters((previous) => ({ ...previous, ...patch }));
  const repositories = info.repositories;
  const readOnly = useMemo(() => {
    const reasons = new Map<number, ReadOnlyReason>();
    for (const repository of repositories) {
      if (repository.removed) reasons.set(repository.id, 'removed');
      else if (repository.archived) reasons.set(repository.id, 'archived');
    }
    return reasons;
  }, [repositories]);

  const people = info.assignable.flatMap((user) => (user.person ? [{ id: user.person.id, name: user.person.fullName }] : []));
  const labels = uniqueLabelNames(repositories);
  const milestones = repositories.flatMap((repository) =>
    repository.milestones.map((milestone) => ({
      id: milestone.id,
      title: repositories.length > 1 ? `${milestone.title} (${repoName(repository.fullName)})` : milestone.title,
    })),
  );

  const move = async (card: IssueCard, target: BoardColumn) => {
    const current = latest.current;
    if (!current || moving) return;
    const plan = moveCard(current, card.id, target);
    if (!plan) return;
    const ref = itemRef(card);
    setMoving(card.id);
    board.setData(plan.board);
    const result = await action.run('move', () => github.moveIssue(card.id, target, card.version));
    if (result.ok) {
      if (latest.current) board.setData(placeCard(latest.current, result.value.item));
      const notes = takeWriteNotes(result.value);
      if (notes.length > 0) onFlash({ title: `${ref} moved to ${columnTitle(target)}`, notes });
      setAnnouncement(`${ref} moved to ${columnTitle(target)}.`);
    } else {
      if (latest.current) board.setData(placeCard(latest.current, plan.original));
      if (result.problem.code === 'issue_changed') board.reload();
      setAnnouncement(`${ref} could not be moved. ${result.problem.message}`);
    }
    setMoving(null);
  };

  const data = board.data;
  const total = data ? boardTotal(data) : 0;
  const filtered = filtersActive(filters);

  return (
    <div className="gh-section gh-pad">
      <form className="filters" role="search" aria-label="Filter issues" onSubmit={(event) => event.preventDefault()}>
        <SearchField label="Search" placeholder="Title" value={filters.q} onChange={(event) => set({ q: event.target.value })} />
        {repositories.length > 1 && (
          <SelectField label="Repository" value={filters.repo} onChange={(event) => set({ repo: event.target.value })}>
            <option value="">All repositories</option>
            {repositories.map((repository) => (
              <option key={repository.id} value={String(repository.id)}>
                {repoName(repository.fullName)}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField label="Assignee" value={filters.assignee} onChange={(event) => set({ assignee: event.target.value })}>
          <option value="">Anyone</option>
          <option value="me">Me</option>
          <option value="none">Unassigned</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </SelectField>
        {labels.length > 0 && (
          <SelectField label="Label" value={filters.label} onChange={(event) => set({ label: event.target.value })}>
            <option value="">Any label</option>
            {labels.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </SelectField>
        )}
        {milestones.length > 0 && (
          <SelectField label="Milestone" value={filters.milestone} onChange={(event) => set({ milestone: event.target.value })}>
            <option value="">Any milestone</option>
            {milestones.map((milestone) => (
              <option key={milestone.id} value={String(milestone.id)}>
                {milestone.title}
              </option>
            ))}
          </SelectField>
        )}
        {filtered && (
          <Button variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </Button>
        )}
      </form>
      <ProblemAlert problem={action.problem} />
      {data?.truncated && (
        <Alert tone="warning" title={`Showing the first ${GITHUB_LIMITS.boardItems} issues.`}>
          Narrow the filters to see the rest.
        </Alert>
      )}
      {!data ? (
        board.problem ? (
          <ErrorState problem={board.problem} onRetry={board.reload} />
        ) : (
          <LoadingBlock rows={4} label="Loading the board" />
        )
      ) : total === 0 ? (
        <EmptyState
          icon={filtered ? 'search' : 'grid'}
          title={filtered ? 'No issues match these filters' : 'No issues yet'}
          action={
            filtered ? (
              <Button onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>
            ) : canWrite ? (
              <Button variant="primary" icon="plus" onClick={onCreate}>
                New issue
              </Button>
            ) : undefined
          }
        >
          {filtered ? 'Try a different search or clear the filters.' : 'Issues from the mapped repositories appear here after the first sync.'}
        </EmptyState>
      ) : (
        <div className="gh-board" role="group" aria-label="Board columns" aria-busy={board.loading || undefined}>
          {data.columns.map((column) => (
            <section key={column.key} className="gh-column" aria-labelledby={`${headings}-${column.key}`}>
              <div className="gh-column-head">
                <h3 id={`${headings}-${column.key}`} className="gh-column-title">
                  {column.title}
                </h3>
                <span className="gh-count">
                  {column.items.length}
                  <span className="visually-hidden"> issues</span>
                </span>
              </div>
              {column.key === 'done' && <p className="caption muted">Closed in the last {GITHUB_LIMITS.doneColumnDays} days</p>}
              {column.items.length === 0 ? (
                <p className="gh-column-empty">Nothing here</p>
              ) : (
                <ul className="gh-cards">
                  {column.items.map((card) => (
                    <IssueCardView
                      key={card.id}
                      card={card}
                      canMove={canWrite}
                      moving={moving === card.id}
                      busy={moving !== null}
                      readOnly={readOnly.get(card.repository.id) ?? null}
                      onMove={move}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
