import { accessRoles, rolePermissions } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../src/server/audit';
import { requirePermission } from '../../../src/server/guard';
import { badRequest, idParam } from '../../../src/server/http';
import { isPermission, PERMISSION_KEYS } from '../../../src/server/permissions';

const permissionsBody = v.object({
  name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60))),
  description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300))),
  permissions: v.pipe(
    v.array(
      v.object({
        permission: v.pipe(v.string(), v.check(isPermission, 'unknown_permission')),
        scope: v.picklist(['global', 'department']),
      }),
    ),
    v.maxLength(PERMISSION_KEYS.length),
  ),
});

/**
 * Create or replace a role's permissions. The admin role always keeps every
 * permission so nobody can lock the club out.
 */
export const PUT = defineHandler.withValidator({ body: permissionsBody })(async (c, { body }) => {
  const actor = requirePermission(c, 'roles.manage');
  const roleId = idParam(c);
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(roleId)) badRequest('invalid_role_id');
  if (roleId === 'admin') badRequest('admin_role_is_fixed');
  const unique = [...new Map(body.permissions.map((p) => [p.permission, p])).values()];
  const [existing] = await db.select().from(accessRoles).where(eq(accessRoles.id, roleId));

  await db.batch([
    existing
      ? db
          .update(accessRoles)
          .set({ name: body.name ?? existing.name, description: body.description ?? existing.description })
          .where(eq(accessRoles.id, roleId))
      : db.insert(accessRoles).values({ id: roleId, name: body.name ?? roleId, description: body.description ?? '' }),
    db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId)),
    ...unique.map((p) => db.insert(rolePermissions).values({ roleId, permission: p.permission, scope: p.scope })),
  ]);
  await audit(actor.person.id, existing ? 'role.update' : 'role.create', 'access_role', roleId, { permissions: unique });
  return { id: roleId, permissions: unique };
});
