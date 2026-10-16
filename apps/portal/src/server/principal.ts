import { people, personGrants, rolePermissions } from '@schema';
import { and, db, eq, inArray } from 'void/db';
import { type PermissionSet, resolvePermissions } from './permissions';

/** Statuses that keep access. Anything else ends access on the next request. */
export const ACTIVE_STATUSES = ['active', 'on_leave'] as const;

export type Person = typeof people.$inferSelect;

export interface Principal {
  person: Person;
  permissions: PermissionSet;
}

/** The person behind a Better Auth user, or null when they have no access. */
export async function loadPrincipal(authUserId: string): Promise<Principal | null> {
  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.authUserId, authUserId), inArray(people.status, [...ACTIVE_STATUSES])))
    .limit(1);
  if (!person) return null;

  const [roleGrants, ownGrants] = await Promise.all([
    db
      .select({ permission: rolePermissions.permission, scope: rolePermissions.scope })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, person.accessRoleId)),
    db
      .select({ permission: personGrants.permission, departmentId: personGrants.departmentId })
      .from(personGrants)
      .where(eq(personGrants.personId, person.id)),
  ]);

  return { person, permissions: resolvePermissions(roleGrants, ownGrants, person.departmentId) };
}

/** JSON-friendly view of a permission set: key -> "global" | department ids. */
export function serializePermissions(set: PermissionSet): Record<string, 'global' | string[]> {
  const out: Record<string, 'global' | string[]> = {};
  for (const [key, scope] of set) out[key] = scope === 'global' ? 'global' : [...scope].sort();
  return out;
}

