import { githubAccounts, githubInstallations, githubIssueLabels, githubIssueParticipants, githubIssues, githubLabels, githubMilestones, githubRepositories, githubWriteRequests } from '@schema';
import { HTTPException } from 'hono/http-exception';
import { and, db, eq, inArray, sql } from 'void/db';
import { audit } from '../../audit';
import { badRequest, conflict, notFound } from '../../http';
import type { Principal } from '../../principal';
import { canSeeProject, type LoadedProject } from '../../projects';
import { githubHttpError, requireGitHub, type GitHubRuntime } from '../runtime';
import {
  type Attribution,
  type CommentView,
  type CommentWriteResponse,
  type CreateCommentInput,
  type CreateIssueInput,
  type GhComment,
  type GhIssue,
  type GhLabel,
  type GitHubAuth,
  type GitHubRequest,
  type IssueCard,
  type IssueWriteResponse,
  type ChangeLabelsInput,
  type MoveIssueInput,
  type SetAssigneesInput,
  type SetStateInput,
  type UpdateIssueInput,
  type WriteRequestKind,
  issueKey,
  STATUS_LABELS,
} from '../types';
import { applyIssue, type MappedRepository } from '../webhook/apply';
import type { LoadedIssue } from './access';
import { asGitHubError, withFooter } from './attribution-rules';
import { NO_ATTRIBUTION, writeAs } from './attribution';
import { isMoveNoop, isLabelledColumn, planMove, statusOfLabel } from './board-rules';
import { cardFor, userResolver } from './reads';
import {
  decideRequest,
  diffAssignees,
  droppedFields,
  isOutcomeUnknown,
  labelChanges,
  labelRequestError,
  requestHash,
  stateChangeBody,
} from './write-rules';

type RequestRow = typeof githubWriteRequests.$inferSelect;

const issuePath = (repository: MappedRepository, number: number): string => `/repos/${repository.fullName}/issues/${number}`;

async function call<T>(runtime: GitHubRuntime, auth: GitHubAuth, request: GitHubRequest): Promise<T> {
  return (await runtime.client.request<T>(auth, request)).data;
}

async function viaGitHub<T>(target: 'issue' | 'repository', mode: 'user' | 'app', run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    return githubHttpError(err, mode, target);
  }
}

async function assertWritable(repository: MappedRepository): Promise<void> {
  if (repository.archived) conflict('repository_archived');
  const [installation] = await db
    .select({ suspendedAt: githubInstallations.suspendedAt, deletedAt: githubInstallations.deletedAt })
    .from(githubInstallations)
    .where(eq(githubInstallations.id, repository.installationId));
  if (!installation || installation.suspendedAt || installation.deletedAt) throw new HTTPException(503, { message: 'installation_suspended' });
}

function checkVersion(loaded: LoadedIssue, expected: number | undefined): void {
  if (expected !== undefined && expected !== loaded.issue.version) conflict('issue_changed');
}

function requireIssueKind(loaded: LoadedIssue): void {
  if (loaded.issue.kind === 'pull') badRequest('pull_request_read_only');
}

async function refreshIssue(runtime: GitHubRuntime, repository: MappedRepository, number: number): Promise<GhIssue> {
  return viaGitHub('issue', 'app', () =>
    call<GhIssue>(runtime, { kind: 'installation', installationId: repository.installationId }, { path: issuePath(repository, number) }),
  );
}

async function applyWritten(repository: MappedRepository, issue: GhIssue): Promise<void> {
  await applyIssue(repository.id, issue, { source: 'write', deliveryId: null, action: null, sender: null });
}

async function finish(
  loaded: LoadedIssue,
  attribution: Attribution,
  issue: GhIssue,
  ignoredAssignees: readonly string[] = [],
): Promise<IssueWriteResponse> {
  await applyWritten(loaded.repository, issue);
  const item = await cardFor(loaded.issue.id);
  if (!item) notFound('issue_not_found');
  return { item, attribution, ignoredAssignees, replayed: false };
}

async function currentCard(loaded: LoadedIssue): Promise<IssueCard> {
  const item = await cardFor(loaded.issue.id);
  if (!item) notFound('issue_not_found');
  return item;
}

async function noop(loaded: LoadedIssue): Promise<IssueWriteResponse> {
  return { item: await currentCard(loaded), attribution: NO_ATTRIBUTION, ignoredAssignees: [], replayed: false };
}

async function knownLabels(repositoryId: number): Promise<string[]> {
  const rows = await db.select({ name: githubLabels.name }).from(githubLabels).where(eq(githubLabels.repositoryId, repositoryId));
  return rows.map((row) => row.name);
}

async function labelsOf(issueId: string): Promise<string[]> {
  const rows = await db
    .select({ name: githubLabels.name })
    .from(githubIssueLabels)
    .innerJoin(githubLabels, eq(githubLabels.id, githubIssueLabels.labelId))
    .where(eq(githubIssueLabels.issueId, issueId));
  return rows.map((row) => row.name);
}

async function ensureMilestone(repositoryId: number, number: number | null | undefined): Promise<void> {
  if (number === null || number === undefined) return;
  const [row] = await db
    .select({ id: githubMilestones.id })
    .from(githubMilestones)
    .where(and(eq(githubMilestones.repositoryId, repositoryId), eq(githubMilestones.number, number)));
  if (!row) badRequest('unknown_milestone');
}

interface ResolvedAssignee {
  readonly personId: string;
  readonly githubUserId: number;
  readonly login: string;
}

async function resolveAssignees(project: LoadedProject, personIds: readonly string[]): Promise<ResolvedAssignee[]> {
  const unique = [...new Set(personIds)];
  if (unique.length > 10) badRequest('too_many_assignees');
  if (unique.length === 0) return [];
  const accounts = await db
    .select({ personId: githubAccounts.personId, githubUserId: githubAccounts.githubUserId, login: githubAccounts.login })
    .from(githubAccounts)
    .where(inArray(githubAccounts.personId, unique));
  if (accounts.length !== unique.length) badRequest('person_not_linked');
  for (const account of accounts) {
    if (!(await canSeeProject(account.personId, project))) badRequest('assignee_cannot_see_project');
  }
  return accounts;
}

async function ensureStatusLabel(runtime: GitHubRuntime, repository: MappedRepository, spec: (typeof STATUS_LABELS)[keyof typeof STATUS_LABELS]): Promise<void> {
  if ((await knownLabels(repository.id)).includes(spec.name)) return;
  try {
    await call<GhLabel>(runtime, { kind: 'installation', installationId: repository.installationId }, {
      method: 'POST',
      path: `/repos/${repository.fullName}/labels`,
      body: { name: spec.name, color: spec.color, description: spec.description },
    });
  } catch (err) {
    if (asGitHubError(err)?.kind === 'validation') return;
    githubHttpError(err, 'app', 'repository');
  }
}

const loginSet = (issue: GhIssue): Set<string> => new Set((issue.assignees ?? []).map((user) => user.login.toLowerCase()));

export async function updateIssue(actor: Principal, loaded: LoadedIssue, input: UpdateIssueInput): Promise<IssueWriteResponse> {
  checkVersion(loaded, input.expectedVersion);
  const remote = input.title !== undefined || input.body !== undefined || input.milestoneNumber !== undefined;
  if (remote) requireIssueKind(loaded);
  const before = await currentCard(loaded);

  let attribution = NO_ATTRIBUTION;
  let issue: GhIssue | null = null;
  if (remote) {
    const runtime = requireGitHub();
    await assertWritable(loaded.repository);
    await ensureMilestone(loaded.repository.id, input.milestoneNumber);
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.body !== undefined) patch.body = input.body;
    if (input.milestoneNumber !== undefined) patch.milestone = input.milestoneNumber;
    const written = await viaGitHub('issue', 'app', () =>
      writeAs(actor, loaded.repository.installationId, (auth) =>
        call<GhIssue>(runtime, auth, { method: 'PATCH', path: issuePath(loaded.repository, loaded.issue.number), body: patch }),
      ),
    );
    attribution = written.attribution;
    issue = written.value;
    await applyWritten(loaded.repository, issue);
  }
  if (input.dueDate !== undefined && input.dueDate !== loaded.issue.dueDate) {
    await db
      .update(githubIssues)
      .set({ dueDate: input.dueDate, dueDateSetBy: actor.person.id, version: sql`${githubIssues.version} + 1` })
      .where(eq(githubIssues.id, loaded.issue.id));
  }
  const item = await currentCard(loaded);
  await audit(actor.person.id, 'github.issue.update', 'github_issue', loaded.issue.id, {
    from: { title: before.title, milestone: before.milestone?.number ?? null, dueDate: before.dueDate },
    to: { title: item.title, milestone: item.milestone?.number ?? null, dueDate: item.dueDate, bodyChanged: input.body !== undefined },
    attribution,
  });
  return { item, attribution, ignoredAssignees: [], replayed: false };
}

export async function moveIssue(actor: Principal, loaded: LoadedIssue, input: MoveIssueInput): Promise<IssueWriteResponse> {
  checkVersion(loaded, input.expectedVersion);
  requireIssueKind(loaded);
  const before = await currentCard(loaded);
  const plan = planMove({ state: loaded.issue.state, labelNames: before.labels.map((label) => label.name) }, input.column);
  if (isMoveNoop(plan)) return noop(loaded);

  const runtime = requireGitHub();
  await assertWritable(loaded.repository);
  const base = issuePath(loaded.repository, loaded.issue.number);
  if (plan.ensureLabel) await ensureStatusLabel(runtime, loaded.repository, plan.ensureLabel);
  const written = await viaGitHub('issue', 'app', () =>
    writeAs(actor, loaded.repository.installationId, async (auth) => {
      let last: GhIssue | null = null;
      if (plan.addLabel) await call(runtime, auth, { method: 'POST', path: `${base}/labels`, body: { labels: [plan.addLabel] } });
      for (const name of plan.removeLabels) {
        try {
          await call(runtime, auth, { method: 'DELETE', path: `${base}/labels/${encodeURIComponent(name)}` });
        } catch (err) {
          if (asGitHubError(err)?.kind !== 'not_found') throw err;
        }
      }
      if (plan.state) {
        last = await call<GhIssue>(runtime, auth, {
          method: 'PATCH',
          path: base,
          body: stateChangeBody(plan.state.state, plan.state.stateReason === 'reopened' ? undefined : 'completed'),
        });
      }
      return last;
    }),
  );
  const issue = written.value ?? (await refreshIssue(runtime, loaded.repository, loaded.issue.number));
  const response = await finish(loaded, written.attribution, issue);
  await audit(actor.person.id, 'github.issue.move', 'github_issue', loaded.issue.id, {
    from: before.column,
    to: response.item.column,
    attribution: written.attribution,
  });
  return response;
}

export async function setAssignees(actor: Principal, loaded: LoadedIssue, input: SetAssigneesInput): Promise<IssueWriteResponse> {
  checkVersion(loaded, input.expectedVersion);
  requireIssueKind(loaded);
  const target = await resolveAssignees(loaded.project, input.personIds);
  const current = await db
    .select({ githubUserId: githubIssueParticipants.githubUserId, login: githubIssueParticipants.login })
    .from(githubIssueParticipants)
    .where(and(eq(githubIssueParticipants.issueId, loaded.issue.id), eq(githubIssueParticipants.role, 'assignee')));
  const linked = current.length
    ? await db.select({ githubUserId: githubAccounts.githubUserId }).from(githubAccounts).where(inArray(githubAccounts.githubUserId, current.map((user) => user.githubUserId)))
    : [];
  const diff = diffAssignees(current, new Set(linked.map((row) => row.githubUserId)), target);
  if (diff.add.length === 0 && diff.remove.length === 0) return noop(loaded);

  const runtime = requireGitHub();
  await assertWritable(loaded.repository);
  const path = `${issuePath(loaded.repository, loaded.issue.number)}/assignees`;
  const written = await viaGitHub('issue', 'app', () =>
    writeAs(actor, loaded.repository.installationId, async (auth) => {
      let last: GhIssue | null = null;
      if (diff.add.length) last = await call<GhIssue>(runtime, auth, { method: 'POST', path, body: { assignees: diff.add } });
      if (diff.remove.length) last = await call<GhIssue>(runtime, auth, { method: 'DELETE', path, body: { assignees: diff.remove } });
      return last;
    }),
  );
  const issue = written.value ?? (await refreshIssue(runtime, loaded.repository, loaded.issue.number));
  const have = loginSet(issue);
  const ignored = diff.add.filter((login) => !have.has(login.toLowerCase()));
  const response = await finish(loaded, written.attribution, issue, ignored);
  await audit(actor.person.id, 'github.issue.assign', 'github_issue', loaded.issue.id, {
    from: current.map((user) => user.login),
    to: (issue.assignees ?? []).map((user) => user.login),
    ignored,
    attribution: written.attribution,
  });
  return response;
}

export async function changeLabels(actor: Principal, loaded: LoadedIssue, input: ChangeLabelsInput): Promise<IssueWriteResponse> {
  checkVersion(loaded, input.expectedVersion);
  requireIssueKind(loaded);
  const add = input.add ?? [];
  const remove = input.remove ?? [];
  const problem = labelRequestError(add, remove, await knownLabels(loaded.repository.id));
  if (problem) badRequest(problem);
  const changes = labelChanges(await labelsOf(loaded.issue.id), add, remove);
  if (changes.add.length === 0 && changes.remove.length === 0) return noop(loaded);

  const runtime = requireGitHub();
  await assertWritable(loaded.repository);
  const base = issuePath(loaded.repository, loaded.issue.number);
  const written = await viaGitHub('issue', 'app', () =>
    writeAs(actor, loaded.repository.installationId, async (auth) => {
      if (changes.add.length) await call(runtime, auth, { method: 'POST', path: `${base}/labels`, body: { labels: changes.add } });
      for (const name of changes.remove) {
        try {
          await call(runtime, auth, { method: 'DELETE', path: `${base}/labels/${encodeURIComponent(name)}` });
        } catch (err) {
          if (asGitHubError(err)?.kind !== 'not_found') throw err;
        }
      }
    }),
  );
  const issue = await refreshIssue(runtime, loaded.repository, loaded.issue.number);
  const response = await finish(loaded, written.attribution, issue);
  await audit(actor.person.id, 'github.issue.label', 'github_issue', loaded.issue.id, { added: changes.add, removed: changes.remove, attribution: written.attribution });
  return response;
}

export async function setState(actor: Principal, loaded: LoadedIssue, input: SetStateInput): Promise<IssueWriteResponse> {
  checkVersion(loaded, input.expectedVersion);
  requireIssueKind(loaded);
  if (input.state === loaded.issue.state) return noop(loaded);
  const runtime = requireGitHub();
  await assertWritable(loaded.repository);
  const written = await viaGitHub('issue', 'app', () =>
    writeAs(actor, loaded.repository.installationId, (auth) =>
      call<GhIssue>(runtime, auth, {
        method: 'PATCH',
        path: issuePath(loaded.repository, loaded.issue.number),
        body: stateChangeBody(input.state, input.reason),
      }),
    ),
  );
  const response = await finish(loaded, written.attribution, written.value);
  await audit(actor.person.id, 'github.issue.state', 'github_issue', loaded.issue.id, {
    from: loaded.issue.state,
    to: input.state,
    reason: input.reason ?? null,
    attribution: written.attribution,
  });
  return response;
}

type Claim = { readonly kind: 'insert' } | { readonly kind: 'replay'; readonly row: RequestRow };

/** Applies the design 9.3 idempotency table; returns what the caller may do next. */
async function claimRequest(personId: string, requestId: string, kind: WriteRequestKind, hash: string): Promise<Claim> {
  const [existing] = await db
    .select()
    .from(githubWriteRequests)
    .where(and(eq(githubWriteRequests.personId, personId), eq(githubWriteRequests.requestId, requestId)));
  const decision = decideRequest(existing ?? null, hash, Date.now());
  switch (decision) {
    case 'insert': {
      const inserted = await db
        .insert(githubWriteRequests)
        .values({ personId, requestId, kind, requestHash: hash })
        .onConflictDoNothing()
        .returning({ requestId: githubWriteRequests.requestId });
      if (inserted.length === 0) conflict('request_in_progress');
      return { kind: 'insert' };
    }
    case 'replay':
      return { kind: 'replay', row: existing as RequestRow };
    case 'retry':
      await db
        .update(githubWriteRequests)
        .set({ status: 'pending', error: null, updatedAt: sql`datetime('now')` })
        .where(and(eq(githubWriteRequests.personId, personId), eq(githubWriteRequests.requestId, requestId)));
      return { kind: 'insert' };
    case 'in_progress':
      return conflict('request_in_progress');
    case 'outcome_unknown':
      return conflict('request_outcome_unknown');
    case 'id_reused':
      return conflict('request_id_reused');
  }
}

async function failRequest(personId: string, requestId: string, err: unknown): Promise<never> {
  const unknown = isOutcomeUnknown(err);
  await db
    .update(githubWriteRequests)
    .set({
      status: unknown ? 'outcome_unknown' : 'failed',
      error: (asGitHubError(err)?.kind ?? (err instanceof Error ? err.name : 'error')).slice(0, 200),
      updatedAt: sql`datetime('now')`,
    })
    .where(and(eq(githubWriteRequests.personId, personId), eq(githubWriteRequests.requestId, requestId)));
  if (unknown) throw new HTTPException(502, { message: 'github_outcome_unknown' });
  return githubHttpError(err, 'app', 'repository');
}

async function finishRequest(personId: string, requestId: string, result: { issueId: string; number: number; htmlUrl: string; commentId: number | null }): Promise<void> {
  await db
    .update(githubWriteRequests)
    .set({ status: 'done', result, error: null, updatedAt: sql`datetime('now')` })
    .where(and(eq(githubWriteRequests.personId, personId), eq(githubWriteRequests.requestId, requestId)));
}

export async function createIssue(actor: Principal, project: LoadedProject, input: CreateIssueInput): Promise<IssueWriteResponse> {
  const [row] = await db
    .select()
    .from(githubRepositories)
    .where(and(eq(githubRepositories.id, input.repositoryId), eq(githubRepositories.projectId, project.project.id)));
  if (!row || row.removedAt) notFound('repository_not_found');
  const repository: MappedRepository = {
    id: row.id,
    installationId: row.installationId,
    projectId: project.project.id,
    ownerLogin: row.ownerLogin,
    name: row.name,
    fullName: row.fullName,
    archived: row.archived,
  };
  const runtime = requireGitHub();
  await assertWritable(repository);

  const assignees = await resolveAssignees(project, input.assigneePersonIds ?? []);
  const labels = [...new Set(input.labels ?? [])];
  const problem = labelRequestError(labels, [], await knownLabels(repository.id));
  if (problem) badRequest(problem);
  await ensureMilestone(repository.id, input.milestoneNumber);
  const column = input.column ?? 'backlog';
  const statusLabel = isLabelledColumn(column) ? STATUS_LABELS[column] : null;

  const hash = await requestHash({
    kind: 'issue',
    projectId: project.project.id,
    repositoryId: input.repositoryId,
    title: input.title,
    body: input.body ?? null,
    assignees: assignees.map((assignee) => assignee.personId).sort(),
    labels: [...labels].sort(),
    milestoneNumber: input.milestoneNumber ?? null,
    column,
    dueDate: input.dueDate ?? null,
  });
  const claim = await claimRequest(actor.person.id, input.requestId, 'issue', hash);
  if (claim.kind === 'replay') {
    const item = claim.row.result ? await cardFor(claim.row.result.issueId) : null;
    if (!item) notFound('issue_not_found');
    return { item, attribution: NO_ATTRIBUTION, ignoredAssignees: [], replayed: true };
  }

  let attribution: Attribution = NO_ATTRIBUTION;
  let created: GhIssue;
  const wanted = { labels: [...labels, ...(statusLabel ? [statusLabel.name] : [])], assignees: assignees.map((assignee) => assignee.login) };
  try {
    if (statusLabel) await ensureStatusLabel(runtime, repository, statusLabel);
    const written = await writeAs(actor, repository.installationId, (auth, mode) =>
      call<GhIssue>(runtime, auth, {
        method: 'POST',
        path: `/repos/${repository.fullName}/issues`,
        body: {
          title: input.title,
          body: mode === 'app' ? withFooter(input.body, 'issue', actor.person.fullName) : (input.body ?? ''),
          assignees: wanted.assignees,
          labels: wanted.labels,
          ...(input.milestoneNumber ? { milestone: input.milestoneNumber } : {}),
        },
      }),
    );
    created = written.value;
    attribution = written.attribution;
  } catch (err) {
    return failRequest(actor.person.id, input.requestId, err);
  }

  const appliedAsApp: ('labels' | 'assignees' | 'milestone')[] = [];
  if (attribution.mode === 'user') {
    const dropped = droppedFields(
      { labels: wanted.labels, assignees: wanted.assignees, milestoneNumber: input.milestoneNumber ?? null },
      { labels: created.labels.map((label) => label.name), assignees: (created.assignees ?? []).map((user) => user.login), milestoneNumber: created.milestone?.number ?? null },
    );
    const app: GitHubAuth = { kind: 'installation', installationId: repository.installationId };
    const base = issuePath(repository, created.number);
    try {
      if (dropped.labels.length) {
        await call(runtime, app, { method: 'POST', path: `${base}/labels`, body: { labels: dropped.labels } });
        appliedAsApp.push('labels');
      }
      if (dropped.assignees.length) {
        await call(runtime, app, { method: 'POST', path: `${base}/assignees`, body: { assignees: dropped.assignees } });
        appliedAsApp.push('assignees');
      }
      if (dropped.milestone && input.milestoneNumber) {
        await call(runtime, app, { method: 'PATCH', path: base, body: { milestone: input.milestoneNumber } });
        appliedAsApp.push('milestone');
      }
    } catch (err) {
      await finishRequest(actor.person.id, input.requestId, { issueId: issueKey(repository.id, created.number), number: created.number, htmlUrl: created.html_url, commentId: null });
      return githubHttpError(err, 'app', 'issue');
    }
  }
  const issue = appliedAsApp.length ? await refreshIssue(runtime, repository, created.number) : created;
  await applyWritten(repository, issue);
  const issueId = issueKey(repository.id, issue.number);
  if (input.dueDate) {
    await db.update(githubIssues).set({ dueDate: input.dueDate, dueDateSetBy: actor.person.id }).where(eq(githubIssues.id, issueId));
  }
  await finishRequest(actor.person.id, input.requestId, { issueId, number: issue.number, htmlUrl: issue.html_url, commentId: null });

  const item = await cardFor(issueId);
  if (!item) notFound('issue_not_found');
  const have = loginSet(issue);
  const ignoredAssignees = wanted.assignees.filter((login) => !have.has(login.toLowerCase()));
  const finalAttribution = { ...attribution, appliedAsApp };
  await audit(actor.person.id, 'github.issue.create', 'github_issue', issueId, {
    projectId: project.project.id,
    to: { title: item.title, column: item.column, assignees: wanted.assignees, labels, dueDate: input.dueDate ?? null },
    attribution: finalAttribution,
  });
  return { item, attribution: finalAttribution, ignoredAssignees, replayed: false };
}

async function commentView(runtime: GitHubRuntime, comment: GhComment): Promise<CommentView> {
  const resolve = await userResolver(comment.user ? [comment.user.id] : []);
  return {
    id: comment.id,
    author: comment.user ? resolve(comment.user.id, comment.user.login) : null,
    body: comment.body,
    htmlUrl: comment.html_url,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  };
}

export async function createComment(actor: Principal, loaded: LoadedIssue, input: CreateCommentInput): Promise<CommentWriteResponse> {
  const runtime = requireGitHub();
  await assertWritable(loaded.repository);
  const hash = await requestHash({ kind: 'comment', issueId: loaded.issue.id, body: input.body });
  const claim = await claimRequest(actor.person.id, input.requestId, 'comment', hash);
  if (claim.kind === 'replay') {
    const commentId = claim.row.result?.commentId;
    if (!commentId) notFound('issue_not_found');
    const existing = await viaGitHub('issue', 'app', () =>
      call<GhComment>(runtime, { kind: 'installation', installationId: loaded.repository.installationId }, { path: `/repos/${loaded.repository.fullName}/issues/comments/${commentId}` }),
    );
    return { comment: await commentView(runtime, existing), attribution: NO_ATTRIBUTION, replayed: true };
  }

  let comment: GhComment;
  let attribution: Attribution;
  try {
    const written = await writeAs(actor, loaded.repository.installationId, (auth, mode) =>
      call<GhComment>(runtime, auth, {
        method: 'POST',
        path: `${issuePath(loaded.repository, loaded.issue.number)}/comments`,
        body: { body: mode === 'app' ? withFooter(input.body, 'comment', actor.person.fullName) : input.body },
      }),
    );
    comment = written.value;
    attribution = written.attribution;
  } catch (err) {
    return failRequest(actor.person.id, input.requestId, err);
  }
  await finishRequest(actor.person.id, input.requestId, { issueId: loaded.issue.id, number: loaded.issue.number, htmlUrl: comment.html_url, commentId: comment.id });
  await audit(actor.person.id, 'github.issue.comment', 'github_issue', loaded.issue.id, { commentId: comment.id, attribution });
  return { comment: await commentView(runtime, comment), attribution, replayed: false };
}
