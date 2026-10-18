import { projectDepartments, projectMembers, projects } from '@schema';
import type { SQL } from 'drizzle-orm';
import { and, eq, inArray, notInArray, or, sql } from 'void/db';
import type { Principal } from './principal';
import { type Coverage, projectViewScope } from './project-rules';

const linked = (extra: SQL) =>
  sql`exists (select 1 from ${projectDepartments} where ${projectDepartments.projectId} = ${projects.id} and ${extra})`;

const within = (ids: readonly string[]) =>
  and(linked(sql`1`), sql`not ${linked(notInArray(projectDepartments.departmentId, [...ids]))}`);

/** SQL equivalent of projectAccess(...).view, applied before ordering and limits. */
export function visibleProjects(principal: Principal): SQL | undefined {
  const scope = projectViewScope(principal.permissions);
  const through = (coverage: Coverage) =>
    coverage === 'global' ? sql`1` : coverage.length ? linked(inArray(projectDepartments.departmentId, [...coverage])) : undefined;
  const all = (coverage: Coverage) => coverage === 'global' ? sql`1` : coverage.length ? within(coverage) : undefined;
  const client = or(through(scope.anyOf), all(scope.allOf), through(scope.clientAnyOf));
  const internal = or(through(scope.internalAnyOf), all(scope.internalAllOf));
  return or(
    sql`exists (select 1 from ${projectMembers} where ${projectMembers.projectId} = ${projects.id} and ${projectMembers.personId} = ${principal.person.id})`,
    client ? and(eq(projects.internal, false), client) : undefined,
    internal ? and(eq(projects.internal, true), internal) : undefined,
  );
}
