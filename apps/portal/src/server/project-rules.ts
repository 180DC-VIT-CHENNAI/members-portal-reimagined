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
 * project. Being named on a project only adds the right to see it.
 */
export function projectAccess(permissions: PermissionSet, departmentIds: readonly string[], isMember: boolean): ProjectAccess {
  const coversAny = (key: Permission) => can(permissions, key, null) || departmentIds.some((id) => can(permissions, key, id));
  const coversAll = (key: Permission) =>
    can(permissions, key, null) || (departmentIds.length > 0 && departmentIds.every((id) => can(permissions, key, id)));
  const manage = coversAll('projects.manage');
  const manageMembers = coversAny('projects.members.manage');
  const manageTasks = coversAny('projects.tasks.manage');
  return { view: isMember || manage || manageMembers || manageTasks || coversAny('projects.view'), manage, manageMembers, manageTasks };
}

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const satisfies Record<TaskPriority, number>;

export interface TaskOrder {
  readonly id: string;
  readonly status: TaskStatus;
  readonly dueDate: string | null;
  readonly priority: TaskPriority;
  readonly createdAt: string;
}

/** Open tasks first, then by due date (undated last), priority and age. */
export function compareTasks(a: TaskOrder, b: TaskOrder): number {
  if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
