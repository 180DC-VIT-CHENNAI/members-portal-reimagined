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
  'people.promotions.approve': "Approve or reject someone else's promotion proposal (never your own or one you proposed)",
  'people.offboard': 'Offboard people: end access, reassign their work, end positions and remove personal grants',
  'onboarding.manage': 'Configure the policy acknowledgments on the first-login checklist',
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
  'knowledge.view': 'Read published knowledge articles in accessible scopes',
  'knowledge.edit': 'Write knowledge drafts and read revision history',
  'knowledge.publish': 'Publish and archive knowledge articles',
  'meets.view': 'See club-wide and inter-department meets',
  'meets.department.view': "See a department's meets",
  'meets.club.manage': 'Schedule, remove and re-announce club-wide meets',
  'meets.inter_department.manage': 'Schedule, remove and re-announce inter-department meets',
  'meets.department.manage': "Schedule, remove and re-announce a department's meets",
  'projects.view': "See a department's projects and their tasks",
  'projects.manage': 'Create, edit, complete, reopen and delete projects',
  'projects.members.manage': "Add and remove people on a department's projects",
  'projects.tasks.manage': "Create, edit, reassign, complete and delete tasks on a department's projects",
  'team_instances.view': 'See team instances: their teams, people, progression and activity',
  'team_instances.manage': "Run a department's team instances: settings, groups, teams, outside people and staffing",
  'letters.manage': 'Create and read official letters within permitted departments',
  'letters.send': 'Email saved letters to permitted recipients',
  'newsletter.edit': 'Write newsletter drafts and send tests to yourself',
  'newsletter.send': 'Broadcast newsletters and events to confirmed subscribers',
  'newsletter.manage': 'Manage newsletter issues and subscribers',
  'email.view': 'Inspect the global email queue and delivery records',
  'email.manage': 'Retry failed email campaigns',
  'email.send': 'Send email globally or to permitted departments',
  'mailboxes.admin': 'Create shared mailboxes and assign managers (no implicit message access)',
  'templates.author': 'Create email templates in the granted scope',
  'templates.edit': 'Create immutable email template revisions',
  'templates.publish': 'Publish reviewed email template versions',
  'templates.retire': 'Retire email templates from new use',
  'templates.draft': 'Prepare mailbox drafts from published templates',
  'templates.review': 'Review mailbox drafts using templates',
  'templates.send': 'Send approved mailbox drafts using templates',
  'departments.members.view': "See a department's current members",
  'departments.instructions.view': "Read a department's instructions",
  'departments.workspace.view': "See a department's workspace overview (documents, instructions, projects)",
  'departments.documents.manage': "Add and remove a department's documents",
  'departments.instructions.manage': "Post and remove a department's instructions",
  'departments.projects.manage': "Add department projects and change their status",
  'chat.moderate': 'Review reported messages and remove them',
  'site.maintenance': 'Turn maintenance mode on or off (and keep access while it is on)',
  'crm.view': 'Open the CRM and see the client records you own or were granted',
  'crm.manage': 'Create and edit client organisations, contacts, opportunities, proposals and engagements you can see',
  'crm.admin': 'See every client record, configure pipeline stages and merge duplicates',
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
