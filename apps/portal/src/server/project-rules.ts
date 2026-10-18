import type { TaskPriority, TaskStatus } from '@schema';
import { can, type Permission, type PermissionSet } from './permissions.ts';

/** What one person may do on one project. */
export interface ProjectAccess {
  readonly view: boolean;
  readonly manage: boolean;
  readonly manageMembers: boolean;
  readonly manageTasks: boolean;
}

/**
 * Project rights from a permission set. Department-scoped grants for members and
 * tasks count when they cover any of the project's departments; `projects.manage`
 * must cover all of them, so one department cannot edit or remove a joint
 * project. On an internal project, `departments.projects.manage` covering all of
 * its departments grants every right. Being named on a project only adds the
 * right to see it.
 */
export function projectAccess(permissions: PermissionSet, departmentIds: readonly string[], isMember: boolean, internal = false): ProjectAccess {
  const coversAny = (key: Permission) => can(permissions, key, null) || departmentIds.some((id) => can(permissions, key, id));
  const coversAll = (key: Permission) =>
    can(permissions, key, null) || (departmentIds.length > 0 && departmentIds.every((id) => can(permissions, key, id)));
  const runsInternal = internal && coversAll('departments.projects.manage');
  if (internal && !isMember && !runsInternal && !coversAny('departments.workspace.view')) {
    return { view: false, manage: false, manageMembers: false, manageTasks: false };
  }
  const manage = coversAll('projects.manage') || runsInternal;
  const manageMembers = coversAny('projects.members.manage') || runsInternal;
  const manageTasks = coversAny('projects.tasks.manage') || runsInternal;
  const reader = internal ? coversAny('departments.workspace.view') : coversAny('projects.view');
  return { view: isMember || manage || manageMembers || manageTasks || reader, manage, manageMembers, manageTasks };
}

/** Departments a grant covers: everywhere, or these (none when empty). */
export type Coverage = 'global' | readonly string[];

/**
 * Which projects a permission set can see, besides those the person is named
 * on, in the shape a query needs; it matches `projectAccess(...).view`:
 * `anyOf` covers a project through any of its departments, `allOf` only when it
 * covers every one of them, and `internalAllOf` likewise but only for internal
 * projects.
 */
export function projectViewScope(permissions: PermissionSet): {
  anyOf: Coverage;
  allOf: Coverage;
  clientAnyOf: Coverage;
  internalAnyOf: Coverage;
  internalAllOf: Coverage;
} {
  const coverage = (...keys: Permission[]): Coverage => {
    const ids = new Set<string>();
    for (const key of keys) {
      const scope = permissions.get(key);
      if (scope === 'global') return 'global';
      for (const id of scope ?? []) ids.add(id);
    }
    return [...ids].sort();
  };
  return {
    anyOf: coverage('projects.members.manage', 'projects.tasks.manage'),
    allOf: coverage('projects.manage'),
    clientAnyOf: coverage('projects.view'),
    internalAnyOf: coverage('departments.workspace.view'),
    internalAllOf: coverage('departments.projects.manage'),
  };
}

export const STATUS_RANK = { pending: 0, blocked: 1, completed: 2 } as const satisfies Record<TaskStatus, number>;
export const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const satisfies Record<TaskPriority, number>;

export interface TaskOrder {
  readonly id: string;
  readonly status: TaskStatus;
  readonly dueDate: string | null;
  readonly priority: TaskPriority;
  readonly createdAt: string;
}

/** Open tasks first, then blocked, then done; each by due date (undated last), priority and age. */
export function compareTasks(a: TaskOrder, b: TaskOrder): number {
  if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
