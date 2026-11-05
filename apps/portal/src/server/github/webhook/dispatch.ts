import { GITHUB_ORG, HANDLED_WEBHOOK_EVENTS, type IgnoreReason } from '../types.ts';

export type HandlerKey =
  | 'installation_upsert'
  | 'installation_suspend'
  | 'installation_delete'
  | 'installation_repos_added'
  | 'installation_repos_removed'
  | 'app_authorization_revoked'
  | 'repository_upsert'
  | 'repository_removed'
  | 'label_upsert'
  | 'label_delete'
  | 'milestone_upsert'
  | 'milestone_delete'
  | 'issue_apply'
  | 'issue_delete'
  | 'issue_comment_apply'
  | 'pull_apply'
  | 'review_apply'
  | 'check_run_apply'
  | 'status_apply';

export interface Gates {
  readonly installation: boolean;
  readonly repository: boolean;
  readonly mapped: boolean;
}

export interface GateFacts {
  readonly installationKnown: boolean;
  readonly repositoryStored: boolean;
  readonly repositoryMapped: boolean;
}

export type Plan = { readonly handler: HandlerKey; readonly gates: Gates } | { readonly ignore: IgnoreReason };

const ISSUE_ACTIONS = [
  'opened', 'edited', 'closed', 'reopened', 'assigned', 'unassigned', 'labeled', 'unlabeled', 'milestoned', 'demilestoned',
  'locked', 'unlocked', 'pinned', 'unpinned', 'typed', 'untyped',
];
const PULL_ACTIONS = [
  'opened', 'edited', 'closed', 'reopened', 'synchronize', 'ready_for_review', 'converted_to_draft', 'assigned', 'unassigned',
  'labeled', 'unlabeled', 'review_requested', 'review_request_removed', 'milestoned', 'demilestoned', 'locked', 'unlocked',
  'auto_merge_enabled', 'auto_merge_disabled', 'enqueued', 'dequeued',
];

export function handlerFor(event: string, action: string | undefined): HandlerKey | null {
  const a = action ?? '';
  switch (event) {
    case 'installation':
      if (['created', 'new_permissions_accepted', 'unsuspend'].includes(a)) return 'installation_upsert';
      if (a === 'suspend') return 'installation_suspend';
      return a === 'deleted' ? 'installation_delete' : null;
    case 'installation_repositories':
      if (a === 'added') return 'installation_repos_added';
      return a === 'removed' ? 'installation_repos_removed' : null;
    case 'github_app_authorization':
      return a === 'revoked' ? 'app_authorization_revoked' : null;
    case 'repository':
      if (['created', 'edited', 'renamed', 'transferred', 'archived', 'unarchived', 'publicized', 'privatized'].includes(a)) return 'repository_upsert';
      return a === 'deleted' ? 'repository_removed' : null;
    case 'label':
      if (a === 'created' || a === 'edited') return 'label_upsert';
      return a === 'deleted' ? 'label_delete' : null;
    case 'milestone':
      if (['created', 'edited', 'opened', 'closed'].includes(a)) return 'milestone_upsert';
      return a === 'deleted' ? 'milestone_delete' : null;
    case 'issues':
      if (ISSUE_ACTIONS.includes(a)) return 'issue_apply';
      return a === 'deleted' || a === 'transferred' ? 'issue_delete' : null;
    case 'issue_comment':
      return ['created', 'edited', 'deleted'].includes(a) ? 'issue_comment_apply' : null;
    case 'pull_request':
      return PULL_ACTIONS.includes(a) ? 'pull_apply' : null;
    case 'pull_request_review':
      return ['submitted', 'edited', 'dismissed'].includes(a) ? 'review_apply' : null;
    case 'check_run':
      return ['created', 'completed', 'rerequested', 'requested_action'].includes(a) ? 'check_run_apply' : null;
    case 'status':
      return 'status_apply';
    default:
      return null;
  }
}

const REPOSITORY_SCOPED = ['label', 'milestone', 'issues', 'issue_comment', 'pull_request', 'pull_request_review', 'check_run', 'status'];
const WITHOUT_STORED_INSTALLATION = ['installation', 'installation_repositories', 'github_app_authorization'];

interface PlanPayload {
  readonly action?: string;
  readonly installation?: { readonly account?: { readonly login?: string } | null };
}

/** Event and action give a handler with the gates it needs, or the reason to ignore the delivery. */
export function planDelivery(event: string, payload: unknown): Plan {
  if (event === 'ping') return { ignore: 'ping' };
  if (!(HANDLED_WEBHOOK_EVENTS as readonly string[]).includes(event)) return { ignore: 'unhandled_event' };
  const p = payload as PlanPayload;
  const handler = handlerFor(event, p.action);
  if (!handler) return { ignore: 'unhandled_event' };
  if (event === 'installation' || event === 'installation_repositories') {
    const login = p.installation?.account?.login;
    if (!login || login.toLowerCase() !== GITHUB_ORG.toLowerCase()) return { ignore: 'foreign_installation' };
  }
  const scoped = REPOSITORY_SCOPED.includes(event);
  return { handler, gates: { installation: !WITHOUT_STORED_INSTALLATION.includes(event), repository: scoped, mapped: scoped } };
}

export function checkGates(gates: Gates, facts: GateFacts): IgnoreReason | null {
  if (gates.installation && !facts.installationKnown) return 'unknown_installation';
  if (gates.repository && !facts.repositoryStored) return 'unknown_repository';
  if (gates.mapped && !facts.repositoryMapped) return 'unmapped_repository';
  return null;
}

export function dispatch(event: string, payload: unknown, facts: GateFacts): { handler: HandlerKey } | { ignore: IgnoreReason } {
  const plan = planDelivery(event, payload);
  if ('ignore' in plan) return plan;
  const reason = checkGates(plan.gates, facts);
  return reason ? { ignore: reason } : { handler: plan.handler };
}

export function gateIds(payload: unknown): { installationId: number | null; repositoryId: number | null } {
  const p = payload as { installation?: { id?: unknown }; repository?: { id?: unknown } };
  const id = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) ? value : null);
  return { installationId: id(p.installation?.id), repositoryId: id(p.repository?.id) };
}

/** Error name and message for the ledger: at most 500 characters, never payload content. */
export function failureDetail(error: unknown): string {
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  return `${name}: ${message}`.slice(0, 500);
}
