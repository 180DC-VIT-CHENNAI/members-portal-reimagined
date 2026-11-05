import { GITHUB_LIMITS, type RepoSyncMode, type RepoSyncStatus, SYNC_PHASES, type SyncCursor, type SyncPhase } from '../types.ts';

export interface SyncBudget {
  remaining: number;
  /** Rows one run may still write, so a run stays within the Worker's subrequest limit; unset means unlimited. */
  items?: number;
}

export function phasesFor(mode: RepoSyncMode): readonly SyncPhase[] {
  return mode === 'full' ? SYNC_PHASES : SYNC_PHASES.filter((phase) => phase !== 'open_issues');
}

/** ISO-8601 without milliseconds, the format GitHub uses (`YYYY-MM-DDTHH:MM:SSZ`). */
export function isoAt(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function isoMinusMinutes(iso: string, minutes: number): string {
  return isoAt(Date.parse(iso) - minutes * 60_000);
}

/** SQLite's `YYYY-MM-DD HH:MM:SS` (UTC) as epoch milliseconds. */
export function sqliteMs(value: string): number {
  return Date.parse(`${value.replace(' ', 'T')}Z`);
}

/** An incremental pass needs a completed pass to start from. */
export function effectiveMode(row: { syncMode: RepoSyncMode; lastSyncedAt: string | null }): RepoSyncMode {
  return row.syncMode === 'incremental' && row.lastSyncedAt ? 'incremental' : 'full';
}

export function startCursor(mode: RepoSyncMode, passStartedAt: string, lastSyncedAt: string | null): SyncCursor {
  const since =
    mode === 'full'
      ? isoMinusMinutes(passStartedAt, GITHUB_LIMITS.fullBackfillDays * 24 * 60)
      : isoMinusMinutes(lastSyncedAt ?? passStartedAt, GITHUB_LIMITS.incrementalOverlapMinutes);
  return { phase: phasesFor(mode)[0] ?? 'labels', page: 1, since, afterNumber: null };
}

export function withPage(cursor: SyncCursor, page: number): SyncCursor {
  return { ...cursor, page, afterNumber: cursor.afterNumber };
}

export function withAfter(cursor: SyncCursor, afterNumber: number): SyncCursor {
  return { ...cursor, afterNumber };
}

/** The cursor at the start of the phase after `cursor.phase`, or null when the pass is complete. */
export function advancePhase(cursor: SyncCursor, mode: RepoSyncMode): SyncCursor | null {
  const phases = phasesFor(mode);
  const next = phases[phases.indexOf(cursor.phase) + 1];
  return next ? { phase: next, page: 1, since: cursor.since, afterNumber: null } : null;
}

export interface DueCandidate {
  readonly id: number;
  readonly syncStatus: RepoSyncStatus;
  readonly lastSyncedAt: string | null;
  /** SQLite format. */
  readonly updatedAt: string;
  readonly syncFailures: number;
}

export function failureBackoffElapsed(candidate: Pick<DueCandidate, 'syncFailures' | 'updatedAt'>, nowMs: number): boolean {
  return nowMs - sqliteMs(candidate.updatedAt) >= candidate.syncFailures * GITHUB_LIMITS.syncFailureBackoffMinutes * 60_000;
}

export function resyncDue(lastSyncedAt: string | null, nowMs: number): boolean {
  return lastSyncedAt === null || nowMs - Date.parse(lastSyncedAt) >= GITHUB_LIMITS.resyncAfterHours * 3_600_000;
}

/** Section 11.1 priority: running, queued, failed past their backoff, then idle ones gone stale; null = not due. */
export function dueRank(candidate: DueCandidate, nowMs: number): 0 | 1 | 2 | 3 | null {
  switch (candidate.syncStatus) {
    case 'running':
      return 0;
    case 'queued':
      return 1;
    case 'failed':
      return failureBackoffElapsed(candidate, nowMs) ? 2 : null;
    case 'idle':
      return resyncDue(candidate.lastSyncedAt, nowMs) ? 3 : null;
  }
}

export function orderDue<T extends DueCandidate>(candidates: readonly T[], nowMs: number): T[] {
  return candidates
    .flatMap((candidate) => {
      const rank = dueRank(candidate, nowMs);
      return rank === null ? [] : [{ candidate, rank }];
    })
    .sort((a, b) => a.rank - b.rank || (a.candidate.lastSyncedAt ?? '').localeCompare(b.candidate.lastSyncedAt ?? '') || a.candidate.id - b.candidate.id)
    .map(({ candidate }) => candidate);
}

/** Calls a paged GitHub read may spend: tokens count too, so the first call for an installation costs one more. */
export function callCost(calls: number, tokenAlreadyMinted: boolean): number {
  return calls + (tokenAlreadyMinted ? 0 : 1);
}

export function canAfford(budget: SyncBudget, cost: number): boolean {
  return budget.remaining >= cost;
}

export function spend(budget: SyncBudget, cost: number): void {
  budget.remaining = Math.max(0, budget.remaining - cost);
}

/** Incremental pulls come newest-updated first; the phase ends at the first one older than `since`. */
export function olderThan(updatedAt: string, since: string | null): boolean {
  return since !== null && updatedAt < since;
}
