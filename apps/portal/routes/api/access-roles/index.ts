import { accessRoles, rolePermissions } from '@schema';
import { defineHandler } from 'void';
import { asc, db } from 'void/db';
import { requirePrincipal } from '../../../src/server/guard';
import { PERMISSIONS } from '../../../src/server/permissions';

/** Roles with their permissions, plus the permission catalogue. */
export const GET = defineHandler(async (c) => {
  await requirePrincipal(c);
  const [roles, grants] = await Promise.all([
    db.select().from(accessRoles).orderBy(asc(accessRoles.name)),
    db.select().from(rolePermissions),
  ]);
  return {
    catalogue: PERMISSIONS,
    roles: roles.map((r) => ({
      ...r,
      permissions: grants.filter((g) => g.roleId === r.id).map(({ permission, scope }) => ({ permission, scope })),
    })),
  };
});
