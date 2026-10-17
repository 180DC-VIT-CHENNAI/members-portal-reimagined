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

export type AdminToolIcon = 'userPlus' | 'upload' | 'briefcase' | 'calendar' | 'shield' | 'fileText' | 'bookOpen' | 'heart' | 'inbox' | 'megaphone' | 'wrench';

export interface AdminTool {
  path: string;
  label: string;
  description: string;
  permission: string;
  icon: AdminToolIcon;
}

export const ADMIN_TOOLS: readonly AdminTool[] = [
  { path: '/newsletter-editor', label: 'Newsletter editor', description: 'Draft issues, test mail and announce events.', permission: 'newsletter.edit', icon: 'bookOpen' },
  { path: '/admin/newsletter-subscribers', label: 'Newsletter subscribers', description: 'Confirmed readers, pending sign-ups and subscription erasure.', permission: 'newsletter.manage', icon: 'inbox' },
  { path: '/admin/email-queue', label: 'Email queue', description: 'Campaign progress, provider acceptance and retries.', permission: 'email.view', icon: 'inbox' },
  { path: '/admin/send-email', label: 'Send email', description: 'Send a plain-text message to permitted recipients.', permission: 'email.send', icon: 'inbox' },
  { path: '/admin/invite', label: 'Invite', description: 'Add one person by email.', permission: 'people.invite', icon: 'userPlus' },
  { path: '/admin/import', label: 'Import', description: 'Invite many people from a CSV file.', permission: 'people.import', icon: 'upload' },
  { path: '/admin/positions', label: 'Positions', description: 'Titles people can hold, by department.', permission: 'positions.manage', icon: 'briefcase' },
  { path: '/admin/terms', label: 'Terms', description: 'Academic years and the start of a new term.', permission: 'terms.manage', icon: 'calendar' },
  { path: '/admin/roles', label: 'Access roles', description: 'What each role is allowed to do.', permission: 'roles.manage', icon: 'shield' },
  { path: '/admin/audit', label: 'Audit log', description: 'Every administrative change, newest first.', permission: 'audit.view', icon: 'fileText' },
  { path: '/admin/case-studies', label: 'Case studies', description: 'Write, edit and remove public case studies.', permission: 'content.publish', icon: 'bookOpen' },
  { path: '/admin/partners', label: 'Clients', description: 'Client logos shown on the public site.', permission: 'content.manage', icon: 'heart' },
  { path: '/admin/consulting', label: 'Consulting requests', description: 'Review "Work with us" requests and reply.', permission: 'consulting.manage', icon: 'inbox' },
  { path: '/admin/announcements', label: 'Announcements', description: 'Post and remove notices for members.', permission: 'announcements.manage', icon: 'megaphone' },
  { path: '/admin/maintenance', label: 'Maintenance', description: 'Pause the members portal for everyone but admins.', permission: 'site.maintenance', icon: 'wrench' },
];

export function visibleAdminTools(perms: PermissionMap): AdminTool[] {
  return ADMIN_TOOLS.filter((tool) => can(perms, tool.permission, tool.permission === 'email.view' ? null : undefined));
}
