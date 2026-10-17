import { can, type PermissionSet } from './permissions.ts';

/** What one person may do with one team instance. */
export interface InstanceAccess {
  /** See it: teams, people, progression and activity. */
  readonly view: boolean;
  /** Run it: groups, teams, outside people, staffing and progression. */
  readonly staff: boolean;
  /** Change its settings, departments or levels, or delete it. */
  readonly configure: boolean;
}

/**
 * Rights on an instance run by `departmentIds`. A department-scoped
 * `team_instances.manage` grant runs an instance when it covers any of its
 * departments, but changing or deleting the instance itself needs all of them,
 * so one department cannot reshape or remove a joint instance.
 */
export function instanceAccess(permissions: PermissionSet, departmentIds: readonly string[]): InstanceAccess {
  const coversAny = (key: 'team_instances.view' | 'team_instances.manage') =>
    can(permissions, key, null) || departmentIds.some((id) => can(permissions, key, id));
  const configure =
    can(permissions, 'team_instances.manage', null) ||
    (departmentIds.length > 0 && departmentIds.every((id) => can(permissions, 'team_instances.manage', id)));
  const staff = coversAny('team_instances.manage');
  return { view: staff || coversAny('team_instances.view'), staff, configure };
}

/**
 * Whether a manager may place someone from `departmentId` on a team: a global
 * grant places anyone, a department grant only people of its departments.
 */
export function canPlace(permissions: PermissionSet, departmentId: string | null): boolean {
  return can(permissions, 'team_instances.manage', departmentId);
}

/** A ladder from level names: positions count from 1 and blank names become "Level n". */
export function ladder(names: readonly string[]): { position: number; name: string }[] {
  return (names.length ? names : ['']).map((name, index) => ({
    position: index + 1,
    name: name.trim().replace(/\s+/g, ' ') || `Level ${index + 1}`,
  }));
}
