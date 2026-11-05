import type {
  AccountLinkView,
  AccountsResponse,
  ActivityResponse,
  BoardColumn,
  BoardResponse,
  BurndownResponse,
  ChangeLabelsInput,
  CommentWriteResponse,
  CreateCommentInput,
  CreateIssueInput,
  DeliveriesResponse,
  DeliveryStatus,
  GitHubMeResponse,
  GitHubNoticesResponse,
  GitHubStatusResponse,
  IssueDetail,
  IssueWriteResponse,
  LinkStartResponse,
  MarkNoticesReadInput,
  MilestonesResponse,
  MyWorkResponse,
  ProjectGitHubResponse,
  PullsResponse,
  RepositoriesResponse,
  SetAssigneesInput,
  SetStateInput,
  UpdateIssueInput,
} from '../server/github/types.ts';
import { api } from './api.ts';
import { attributionNote, type BoardFilters, boardQuery, writeNotes } from './github-view.ts';

interface CallOptions {
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

/** The /api/github routes come from another lane and may be missing from the generated route map; the shared contract types the answers instead. */
const call = api as unknown as <T>(path: string, options?: CallOptions) => Promise<T>;

function compact(values: Record<string, string | undefined>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) if (value) query[key] = value;
  return query;
}

export interface PullsQuery {
  readonly state?: 'open' | 'closed' | 'all';
  readonly repo?: string;
  readonly author?: 'me';
}

export const github = {
  project: (projectId: string) => call<ProjectGitHubResponse>('/api/github/projects/:id', { params: { id: projectId } }),
  board: (projectId: string, filters: BoardFilters) =>
    call<BoardResponse>('/api/github/projects/:id/board', { params: { id: projectId }, query: boardQuery(filters) }),
  pulls: (projectId: string, query: PullsQuery) =>
    call<PullsResponse>('/api/github/projects/:id/pulls', { params: { id: projectId }, query: compact({ ...query }) }),
  milestones: (projectId: string, repo?: string) =>
    call<MilestonesResponse>('/api/github/projects/:id/milestones', { params: { id: projectId }, query: compact({ repo }) }),
  burndown: (projectId: string, milestoneId: number) =>
    call<BurndownResponse>('/api/github/projects/:id/burndown', { params: { id: projectId }, query: { milestone: String(milestoneId) } }),
  activity: (projectId: string, before?: number) =>
    call<ActivityResponse>('/api/github/projects/:id/activity', { params: { id: projectId }, query: compact({ before: before?.toString(), limit: '50' }) }),
  createIssue: (projectId: string, input: CreateIssueInput) =>
    call<IssueWriteResponse>('/api/github/projects/:id/issues', { method: 'POST', params: { id: projectId }, body: input }),

  issue: (id: string) => call<IssueDetail>('/api/github/issues/:id', { params: { id } }),
  updateIssue: (id: string, input: UpdateIssueInput) => call<IssueWriteResponse>('/api/github/issues/:id', { method: 'PATCH', params: { id }, body: input }),
  moveIssue: (id: string, column: BoardColumn, expectedVersion?: number) =>
    call<IssueWriteResponse>('/api/github/issues/:id/column', { method: 'PUT', params: { id }, body: { column, expectedVersion } }),
  setAssignees: (id: string, input: SetAssigneesInput) =>
    call<IssueWriteResponse>('/api/github/issues/:id/assignees', { method: 'PUT', params: { id }, body: input }),
  changeLabels: (id: string, input: ChangeLabelsInput) => call<IssueWriteResponse>('/api/github/issues/:id/labels', { method: 'PUT', params: { id }, body: input }),
  setState: (id: string, input: SetStateInput) => call<IssueWriteResponse>('/api/github/issues/:id/state', { method: 'PUT', params: { id }, body: input }),
  comment: (id: string, input: CreateCommentInput) =>
    call<CommentWriteResponse>('/api/github/issues/:id/comments', { method: 'POST', params: { id }, body: input }),

  myWork: () => call<MyWorkResponse>('/api/github/my-work'),
  me: () => call<GitHubMeResponse>('/api/github/me'),
  startLink: () => call<LinkStartResponse>('/api/github/link', { method: 'POST' }),
  unlink: () => call<void>('/api/github/link', { method: 'DELETE' }),
  notices: (before?: number) => call<GitHubNoticesResponse>('/api/github/notifications', { query: compact({ before: before?.toString(), limit: '20' }) }),
  markNoticesRead: (input: MarkNoticesReadInput) => call<{ unread: number }>('/api/github/notifications/read', { method: 'POST', body: input }),

  status: () => call<GitHubStatusResponse>('/api/github/status'),
  syncInstallations: () => call<GitHubStatusResponse>('/api/github/installations/sync', { method: 'POST' }),
  repositories: (query: { mapped?: boolean; q?: string }) =>
    call<RepositoriesResponse>('/api/github/repositories', { query: compact({ mapped: query.mapped === undefined ? undefined : String(query.mapped), q: query.q?.trim() }) }),
  mapRepository: (repositoryId: number, projectId: string | null) =>
    call<RepositoriesResponse>('/api/github/repositories/:id/project', { method: 'PUT', params: { id: String(repositoryId) }, body: { projectId } }),
  syncRepository: (repositoryId: number, full = false) =>
    call<RepositoriesResponse>('/api/github/repositories/:id/sync', { method: 'POST', params: { id: String(repositoryId) }, body: full ? { full: true } : {} }),
  deliveries: (query: { status?: DeliveryStatus; cursor?: string | null }) =>
    call<DeliveriesResponse>('/api/github/deliveries', { query: compact({ status: query.status, cursor: query.cursor ?? undefined, limit: '25' }) }),
  accounts: () => call<AccountsResponse>('/api/github/accounts'),
  linkAccount: (personId: string, login: string) =>
    call<{ link: AccountLinkView }>('/api/github/accounts/:personId', { method: 'PUT', params: { personId }, body: { login } }),
  unlinkAccount: (personId: string) => call<void>('/api/github/accounts/:personId', { method: 'DELETE', params: { personId } }),
};

/** One id per create form or comment draft: the server answers a repeat of the same id and content with the first result. */
export const mintRequestId = (): string => crypto.randomUUID();

const NOTE_KEY = 'portal.github.note.';
const seenNotes = new Set<string>();

function firstTimeThisSession(reason: string): boolean {
  if (seenNotes.has(reason)) return false;
  seenNotes.add(reason);
  try {
    if (sessionStorage.getItem(NOTE_KEY + reason)) return false;
    sessionStorage.setItem(NOTE_KEY + reason, '1');
  } catch {
    // Blocked storage only means the note can show again after a reload.
  }
  return true;
}

/** What to tell the writer after a write: the portal-app attribution once per session, everything else each time. */
export function takeWriteNotes(response: Pick<IssueWriteResponse, 'attribution' | 'ignoredAssignees'>): string[] {
  const notes = writeNotes(response);
  const attribution = attributionNote(response.attribution);
  if (attribution && firstTimeThisSession(response.attribution.fallbackReason ?? 'not_linked')) notes.unshift(attribution);
  return notes;
}
