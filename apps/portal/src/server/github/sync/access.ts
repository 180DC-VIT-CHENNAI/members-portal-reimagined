import { githubIssues, githubRepositories, projects } from '@schema';
import type { SQL } from 'drizzle-orm';
import type { Context } from 'hono';
import { db, eq, sql } from 'void/db';
import { requirePermission } from '../../guard';
import { forbidden, notFound } from '../../http';
import { can, type Permission } from '../../permissions';
import { visibleProjects } from '../../project-visibility';
import type { Principal } from '../../principal';
import { type LoadedProject, projectFor } from '../../projects';
import type { MappedRepository } from '../webhook/apply';

/* The permission catalogue (src/server/permissions.ts) gains these two keys with the integrate step; until then the casts keep this file compiling. */
export const GITHUB_MANAGE = 'github.manage' as string as Permission;
export const GITHUB_ISSUES_WRITE = 'github.issues.write' as string as Permission;

export type RepositoryRow = typeof githubRepositories.$inferSelect;
export type IssueRow = typeof githubIssues.$inferSelect;

export interface LoadedIssue {
  readonly issue: IssueRow;
  readonly repository: MappedRepository;
  readonly repositoryRow: RepositoryRow;
  readonly project: LoadedProject;
}

/** `github.manage`, global only: a department-scoped grant never passes. */
export function requireGitHubManage(c: Context): Promise<Principal> {
  return requirePermission(c, GITHUB_MANAGE, null);
}

/** GitHub repositories mapped to a project the caller can view. */
export function visibleRepositoryScope(principal: Principal): SQL | undefined {
  const visible = visibleProjects(principal) ?? sql`1`;
  return sql`${githubRepositories.projectId} is not null and exists (select 1 from ${projects} where ${projects.id} = ${githubRepositories.projectId} and ${visible})`;
}

export function mappedRepositoryOf(row: RepositoryRow): MappedRepository | null {
  if (!row.projectId || row.removedAt) return null;
  return {
    id: row.id,
    installationId: row.installationId,
    projectId: row.projectId,
    ownerLogin: row.ownerLogin,
    name: row.name,
    fullName: row.fullName,
    archived: row.archived,
  };
}

/** The item with its repository and project; 404 `issue_not_found` when unknown or unmapped, `project_not_found` when hidden. */
export async function loadIssueFor(principal: Principal, issueId: string): Promise<LoadedIssue> {
  const [row] = await db
    .select({ issue: githubIssues, repositoryRow: githubRepositories })
    .from(githubIssues)
    .innerJoin(githubRepositories, eq(githubRepositories.id, githubIssues.repositoryId))
    .where(eq(githubIssues.id, issueId))
    .limit(1);
  if (!row?.repositoryRow.projectId) notFound('issue_not_found');
  const project = await projectFor(principal, row.repositoryRow.projectId);
  const repository = mappedRepositoryOf({ ...row.repositoryRow, removedAt: null });
  if (!repository) notFound('issue_not_found');
  return { issue: row.issue, repository, repositoryRow: row.repositoryRow, project };
}

export function repositoryIdParam(c: Context): number {
  const value = Number(c.req.param('id'));
  if (!Number.isSafeInteger(value) || value <= 0) notFound('repository_not_found');
  return value;
}

export function canWriteIssues(principal: Principal, project: LoadedProject): boolean {
  return can(principal.permissions, GITHUB_ISSUES_WRITE, null) || project.departmentIds.some((departmentId) => can(principal.permissions, GITHUB_ISSUES_WRITE, departmentId));
}

export function requireIssueWrite(principal: Principal, project: LoadedProject): void {
  if (!canWriteIssues(principal, project)) forbidden();
}
