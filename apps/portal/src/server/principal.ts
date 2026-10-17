import { people, personGrants, rolePermissions } from '@schema';
import type { SQL } from 'drizzle-orm';
import { and, asc, db, eq, inArray } from 'void/db';
import { type Grant, type PermissionSet, resolvePermissions } from './permissions';

/** Statuses that keep access. Anything else ends access on the next request. */
export const ACTIVE_STATUSES = ['active', 'on_leave'] as const;

export type Person = typeof people.$inferSelect;

export interface Principal {
  person: Person;
  permissions: PermissionSet;
}

/** The person behind a Better Auth user, or null when they have no access. */
export function loadPrincipal(authUserId: string): Promise<Principal | null> {
  return principalWhere(eq(people.authUserId, authUserId));
}

/** A person and their permissions by person id, or null when they have no access. */
export function loadPersonPrincipal(personId: string): Promise<Principal | null> {
  return principalWhere(eq(people.id, personId));
}

async function principalWhere(match: SQL): Promise<Principal | null> {
  const [person] = await db
    .select()
    .from(people)
    .where(and(match, inArray(people.status, [...ACTIVE_STATUSES])))
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


/** Everyone with access and their permissions, by name (for audiences and pickers). */
export async function loadActivePrincipals(): Promise<Principal[]> {
  const [persons, roleGrants, ownGrants] = await Promise.all([
    db.select().from(people).where(inArray(people.status, [...ACTIVE_STATUSES])).orderBy(asc(people.fullName)),
    db.select({ roleId: rolePermissions.roleId, permission: rolePermissions.permission, scope: rolePermissions.scope }).from(rolePermissions),
    db.select({ personId: personGrants.personId, permission: personGrants.permission, departmentId: personGrants.departmentId }).from(personGrants),
  ]);
  const byRole = new Map<string, typeof roleGrants>();
  for (const grant of roleGrants) byRole.set(grant.roleId, [...(byRole.get(grant.roleId) ?? []), grant]);
  const byPerson = new Map<string, Grant[]>();
  for (const grant of ownGrants) byPerson.set(grant.personId, [...(byPerson.get(grant.personId) ?? []), grant]);
  return persons.map((person) => ({
    person,
    permissions: resolvePermissions(byRole.get(person.accessRoleId) ?? [], byPerson.get(person.id) ?? [], person.departmentId),
  }));
}
