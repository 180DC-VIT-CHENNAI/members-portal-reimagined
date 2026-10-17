/**
 * Permission catalogue. Every check in the API names one of these keys, so new
 * features add keys here and grant them to roles in a migration.
 */
export const PERMISSIONS = {
  'people.view': 'See the member directory (public profile fields)',
  'people.view_private': 'See private profile fields (phone, reg no)',
  'people.invite': 'Add people by email',
  'people.edit': "Edit other people's profiles, department and position",
  'people.lifecycle': 'Change status: activate, leave, alumni, remove',
  'people.grants': 'Change access roles and individual grants',
  'people.import': 'Bulk import people from CSV',
  'people.export': 'Export the directory as CSV',
  'positions.manage': 'Create and edit positions/titles',
  'terms.manage': 'Create terms and start a new term',
  'roles.manage': 'Edit access roles and their permissions',
  'audit.view': 'Read the audit log',
  'content.publish': 'Write and edit case studies',
  'content.manage': 'Delete case studies and manage partners',
  'consulting.manage': 'Review, accept, reject and delete consulting requests',
  'announcements.manage': 'Post and remove announcements',
  'files.view': 'Browse and download the shared club files',
  'files.manage': 'Upload and delete shared club files',
  'meets.view': 'See club-wide and inter-department meets',
  'meets.department.view': "See a department's meets",
  'meets.club.manage': 'Schedule, remove and re-announce club-wide meets',
  'meets.inter_department.manage': 'Schedule, remove and re-announce inter-department meets',
  'meets.department.manage': "Schedule, remove and re-announce a department's meets",
  'email.view': 'Inspect the global email queue and delivery records',
  'email.manage': 'Retry failed email campaigns',
  'email.send': 'Send email globally or to permitted departments',
  'departments.members.view': "See a department's current members",
  'departments.instructions.view': "Read a department's instructions",
  'departments.workspace.view': "See a department's workspace overview (documents, instructions, projects)",
  'departments.documents.manage': "Add and remove a department's documents",
  'departments.instructions.manage': "Post and remove a department's instructions",
  'departments.projects.manage': "Add department projects and change their status",
  'site.maintenance': 'Turn maintenance mode on or off (and keep access while it is on)',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

/** A grant as stored: global, or limited to one department. */
export interface Grant {
  permission: string;
  /** null = everywhere */
  departmentId: string | null;
}

/** permission -> 'global' or the set of departments it applies to. */
export type PermissionSet = Map<Permission, 'global' | Set<string>>;

/**
 * Merge role grants and personal grants. A role grant with scope "department"
 * applies to the holder's own department; personal grants carry their own.
 */
export function resolvePermissions(
  roleGrants: { permission: string; scope: 'global' | 'department' }[],
  personGrants: Grant[],
  ownDepartmentId: string | null,
): PermissionSet {
  const set: PermissionSet = new Map();
  const add = (permission: string, departmentId: string | null) => {
    if (!isPermission(permission)) return; // unknown keys from old data are ignored
    const current = set.get(permission);
    if (current === 'global') return;
    if (departmentId === null) {
      set.set(permission, 'global');
      return;
    }
    const depts = current ?? new Set<string>();
    depts.add(departmentId);
    set.set(permission, depts);
  };
  for (const g of roleGrants) {
    if (g.scope === 'global') add(g.permission, null);
    else if (ownDepartmentId) add(g.permission, ownDepartmentId);
  }
  for (const g of personGrants) add(g.permission, g.departmentId);
  return set;
}

/**
 * True when the set allows `permission`. Without `departmentId` the check asks
 * "anywhere at all"; with it, a department-scoped grant must cover that department.
 */
export function can(set: PermissionSet, permission: Permission, departmentId?: string | null): boolean {
  const scope = set.get(permission);
  if (!scope) return false;
  if (scope === 'global') return true;
  if (departmentId === undefined) return scope.size > 0;
  return departmentId !== null && scope.has(departmentId);
}
