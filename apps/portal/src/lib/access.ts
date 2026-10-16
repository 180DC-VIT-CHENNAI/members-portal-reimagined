export type PermissionMap = Record<string, 'global' | string[]>;

/**
 * Client mirror of `can` in src/server/permissions.ts, used only to hide UI.
 * The API makes the real decision on every request.
 */
export function can(perms: PermissionMap, permission: string, departmentId?: string | null): boolean {
  const scope = perms[permission];
  if (!scope) return false;
  if (scope === 'global') return true;
  if (departmentId === undefined) return scope.length > 0;
  return departmentId !== null && scope.includes(departmentId);
}

export type AdminToolIcon = 'userPlus' | 'upload' | 'briefcase' | 'calendar' | 'shield' | 'fileText';

export interface AdminTool {
  path: string;
  label: string;
  description: string;
  permission: string;
  icon: AdminToolIcon;
}

export const ADMIN_TOOLS: readonly AdminTool[] = [
  { path: '/admin/invite', label: 'Invite', description: 'Add one person by email.', permission: 'people.invite', icon: 'userPlus' },
  { path: '/admin/import', label: 'Import', description: 'Invite many people from a CSV file.', permission: 'people.import', icon: 'upload' },
  { path: '/admin/positions', label: 'Positions', description: 'Titles people can hold, by department.', permission: 'positions.manage', icon: 'briefcase' },
  { path: '/admin/terms', label: 'Terms', description: 'Academic years and the start of a new term.', permission: 'terms.manage', icon: 'calendar' },
  { path: '/admin/roles', label: 'Access roles', description: 'What each role is allowed to do.', permission: 'roles.manage', icon: 'shield' },
  { path: '/admin/audit', label: 'Audit log', description: 'Every administrative change, newest first.', permission: 'audit.view', icon: 'fileText' },
];

export function visibleAdminTools(perms: PermissionMap): AdminTool[] {
  return ADMIN_TOOLS.filter((tool) => can(perms, tool.permission));
}
