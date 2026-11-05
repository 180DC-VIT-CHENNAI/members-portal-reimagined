import { GITHUB_LIMITS, type WriteRequestStatus } from '../types.ts';
import { asGitHubError } from './attribution-rules.ts';
import { statusOfLabel } from './board-rules.ts';

export function isOutcomeUnknown(err: unknown): boolean {
  const kind = asGitHubError(err)?.kind;
  return kind === 'unavailable' || kind === 'network' || kind === 'timeout';
}

export type RequestDecision = 'insert' | 'replay' | 'in_progress' | 'outcome_unknown' | 'retry' | 'id_reused';

export interface StoredRequest {
  readonly requestHash: string;
  readonly status: WriteRequestStatus;
  /** SQLite format. */
  readonly updatedAt: string;
}

/** Section 9.3: what an existing (person, request id) row means for a repeated create. */
export function decideRequest(existing: StoredRequest | null, hash: string, nowMs: number): RequestDecision {
  if (!existing) return 'insert';
  if (existing.requestHash !== hash) return 'id_reused';
  switch (existing.status) {
    case 'done':
      return 'replay';
    case 'failed':
      return 'retry';
    case 'outcome_unknown':
      return 'outcome_unknown';
    case 'pending': {
      const ageMs = nowMs - Date.parse(`${existing.updatedAt.replace(' ', 'T')}Z`);
      return ageMs < GITHUB_LIMITS.writeRequestPendingMinutes * 60_000 ? 'in_progress' : 'outcome_unknown';
    }
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function requestHash(value: unknown): Promise<string> {
  return sha256Hex(canonicalJson(value));
}

export interface GithubUser {
  readonly githubUserId: number;
  readonly login: string;
}

/**
 * Assignee changes for a "complete set of portal-managed assignees" request:
 * additions are targets not yet assigned; removals are only assignees linked to
 * a portal person (`managedIds`), so unlinked GitHub assignees are left alone.
 */
export function diffAssignees(current: readonly GithubUser[], managedIds: ReadonlySet<number>, target: readonly GithubUser[]) {
  const have = new Set(current.map((user) => user.githubUserId));
  const want = new Set(target.map((user) => user.githubUserId));
  return {
    add: target.filter((user) => !have.has(user.githubUserId)).map((user) => user.login),
    remove: current.filter((user) => managedIds.has(user.githubUserId) && !want.has(user.githubUserId)).map((user) => user.login),
  };
}

export type LabelError = 'use_column_endpoint' | 'unknown_label';

/** 400 code for a label request, or null: status labels belong to the column endpoint and added names must exist. */
export function labelRequestError(add: readonly string[], remove: readonly string[], known: readonly string[]): LabelError | null {
  if ([...add, ...remove].some((name) => statusOfLabel(name) !== null)) return 'use_column_endpoint';
  const exists = new Set(known);
  return add.some((name) => !exists.has(name)) ? 'unknown_label' : null;
}

export function labelChanges(current: readonly string[], add: readonly string[], remove: readonly string[]) {
  const have = new Set(current);
  return {
    add: [...new Set(add)].filter((name) => !have.has(name)),
    remove: [...new Set(remove)].filter((name) => have.has(name)),
  };
}

export interface CreatedFields {
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
  readonly milestoneNumber: number | null;
}

/** Fields GitHub silently dropped from a user-token create (no push access), to be set again as the App. */
export function droppedFields(requested: CreatedFields, created: CreatedFields) {
  const lower = (names: readonly string[]) => new Set(names.map((name) => name.toLowerCase()));
  const haveLabels = lower(created.labels);
  const haveAssignees = lower(created.assignees);
  return {
    labels: requested.labels.filter((name) => !haveLabels.has(name.toLowerCase())),
    assignees: requested.assignees.filter((login) => !haveAssignees.has(login.toLowerCase())),
    milestone: requested.milestoneNumber !== null && created.milestoneNumber !== requested.milestoneNumber,
  };
}

export function stateChangeBody(state: 'open' | 'closed', reason: 'completed' | 'not_planned' | undefined) {
  return state === 'open' ? { state, state_reason: 'reopened' } : { state, state_reason: reason ?? 'completed' };
}
