import {
  applyCheckRun,
  applyCommitStatus,
  applyInstallation,
  applyIssue,
  applyLabel,
  applyMilestone,
  applyPull,
  applyRepository,
  applyReview,
  clearRepositoriesRemoved,
  deleteIssue,
  deleteLabel,
  deleteMilestone,
  flagRepositoryListRefresh,
  installationKnown,
  markInstallationDeleted,
  markRepositoriesRemoved,
  refreshLogins,
  repositoryState,
  revokeUserTokensOfGithubUser,
  setInstallationSuspended,
  type MappedRepository,
} from './apply.ts';
import { ownerLogin, usersOf } from './apply-rules.ts';
import { checkGates, gateIds, planDelivery, type HandlerKey } from './dispatch.ts';
import { recordActivity, recordNotices } from './notices.ts';
import { GITHUB_ORG, issueKey, type ApplyContext, type GhRepository, type GhUser, type WebhookOutcome, type WebhookPayloads } from '../types.ts';

interface Handling {
  readonly deliveryId: string;
  readonly event: string;
  readonly action: string | undefined;
  readonly payload: unknown;
  readonly ctx: ApplyContext;
  readonly installationId: number | null;
  readonly repo: MappedRepository | null;
}

type Handler = (h: Handling) => Promise<boolean>;

function requireRepo(h: Handling): MappedRepository {
  if (!h.repo) throw new Error('mapped repository missing for a repository-scoped event');
  return h.repo;
}

function requireInstallation(h: Handling): number {
  if (h.installationId === null) throw new Error('installation id missing');
  return h.installationId;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function effects(h: Handling, issueId: string): Promise<void> {
  const effect = { deliveryId: h.deliveryId, repositoryId: requireRepo(h).id, issueId, event: h.event, action: h.action, payload: h.payload };
  await recordActivity(effect);
  await recordNotices(effect);
}

async function addRepositories(installationId: number, repositories: readonly GhRepository[]): Promise<void> {
  for (const repo of repositories) await applyRepository(repo, installationId);
  await clearRepositoriesRemoved(repositories.map((r) => r.id));
  await flagRepositoryListRefresh(installationId);
}

const HANDLERS: Record<HandlerKey, Handler> = {
  async installation_upsert(h) {
    const p = h.payload as WebhookPayloads['installation'];
    await applyInstallation(p.installation);
    if (h.action === 'created') await addRepositories(p.installation.id, p.repositories ?? []);
    return true;
  },
  async installation_suspend(h) {
    const p = h.payload as WebhookPayloads['installation'];
    await applyInstallation(p.installation);
    await setInstallationSuspended(p.installation.id, p.installation.suspended_at ?? nowIso());
    return true;
  },
  async installation_delete(h) {
    await markInstallationDeleted((h.payload as WebhookPayloads['installation']).installation.id);
    return true;
  },
  async installation_repos_added(h) {
    const p = h.payload as WebhookPayloads['installation_repositories'];
    await applyInstallation(p.installation);
    await addRepositories(p.installation.id, p.repositories_added);
    return true;
  },
  async installation_repos_removed(h) {
    await markRepositoriesRemoved((h.payload as WebhookPayloads['installation_repositories']).repositories_removed.map((r) => r.id));
    return true;
  },
  async app_authorization_revoked(h) {
    await revokeUserTokensOfGithubUser((h.payload as WebhookPayloads['github_app_authorization']).sender.id, 'app_authorization_revoked');
    return true;
  },
  async repository_upsert(h) {
    const repo = (h.payload as WebhookPayloads['repository']).repository;
    await applyRepository(repo, requireInstallation(h));
    if (h.action === 'transferred' && ownerLogin(repo).toLowerCase() !== GITHUB_ORG.toLowerCase()) await markRepositoriesRemoved([repo.id]);
    return true;
  },
  async repository_removed(h) {
    await markRepositoriesRemoved([(h.payload as WebhookPayloads['repository']).repository.id]);
    return true;
  },
  async label_upsert(h) {
    await applyLabel(requireRepo(h).id, (h.payload as WebhookPayloads['label']).label);
    return true;
  },
  async label_delete(h) {
    await deleteLabel((h.payload as WebhookPayloads['label']).label.id);
    return true;
  },
  async milestone_upsert(h) {
    await applyMilestone(requireRepo(h).id, (h.payload as WebhookPayloads['milestone']).milestone);
    return true;
  },
  async milestone_delete(h) {
    await deleteMilestone((h.payload as WebhookPayloads['milestone']).milestone.id);
    return true;
  },
  async issue_apply(h) {
    const result = await applyIssue(requireRepo(h).id, (h.payload as WebhookPayloads['issues']).issue, h.ctx);
    if (result.changed) await effects(h, result.id);
    return result.changed;
  },
  async issue_delete(h) {
    await deleteIssue(requireRepo(h).id, (h.payload as WebhookPayloads['issues']).issue.number);
    return true;
  },
  async issue_comment_apply(h) {
    const result = await applyIssue(requireRepo(h).id, (h.payload as WebhookPayloads['issue_comment']).issue, h.ctx);
    if (result.changed) await effects(h, result.id);
    return result.changed;
  },
  async pull_apply(h) {
    const result = await applyPull(requireRepo(h).id, (h.payload as WebhookPayloads['pull_request']).pull_request, h.ctx);
    if (result.changed) await effects(h, result.id);
    return result.changed;
  },
  async review_apply(h) {
    const p = h.payload as WebhookPayloads['pull_request_review'];
    const repo = requireRepo(h);
    await applyPull(repo.id, p.pull_request, h.ctx);
    await applyReview(repo.id, p.pull_request.number, p.review, h.ctx);
    await effects(h, issueKey(repo.id, p.pull_request.number));
    return true;
  },
  async check_run_apply(h) {
    return applyCheckRun(requireRepo(h).id, (h.payload as WebhookPayloads['check_run']).check_run);
  },
  async status_apply(h) {
    const p = h.payload as WebhookPayloads['status'];
    return applyCommitStatus(requireRepo(h).id, { id: p.id, sha: p.sha, context: p.context, state: p.state, target_url: p.target_url });
  },
};

/** Classifies a verified delivery, applies it to D1 and reports processed or ignored; a throw leaves the ledger row to the caller. */
export async function handleDelivery(deliveryId: string, event: string, payload: unknown): Promise<WebhookOutcome> {
  const plan = planDelivery(event, payload);
  if ('ignore' in plan) return { status: 'ignored', reason: plan.ignore };

  const { installationId, repositoryId } = gateIds(payload);
  const knownInstallation = installationId !== null && (await installationKnown(installationId));
  const repository = repositoryId === null ? { stored: false, mapped: null } : await repositoryState(repositoryId);
  const reason = checkGates(plan.gates, {
    installationKnown: knownInstallation,
    repositoryStored: repository.stored,
    repositoryMapped: repository.mapped !== null,
  });
  if (reason) {
    if (reason === 'unknown_repository' && knownInstallation && installationId !== null) await flagRepositoryListRefresh(installationId);
    return { status: 'ignored', reason };
  }

  const envelope = payload as { action?: string; sender?: GhUser };
  const handling: Handling = {
    deliveryId,
    event,
    action: envelope.action,
    payload,
    ctx: { source: 'webhook', deliveryId, action: envelope.action ?? null, sender: envelope.sender ?? null },
    installationId,
    repo: repository.mapped,
  };
  const wrote = await HANDLERS[plan.handler](handling);
  if (!wrote) return { status: 'ignored', reason: 'stale' };
  await refreshLogins(usersOf(payload));
  return { status: 'processed' };
}
