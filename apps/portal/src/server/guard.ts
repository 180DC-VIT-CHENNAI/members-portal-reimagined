import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { can, type Permission } from './permissions';
import type { Principal } from './principal';

/** The signed-in member with access, or 401. */
export function requirePrincipal(c: Context): Principal {
  const principal = c.get('principal') as Principal | null | undefined;
  if (!principal) throw new HTTPException(401, { message: 'unauthorized' });
  return principal;
}

/**
 * The signed-in member holding `permission` (for `departmentId` when given),
 * or 401/403.
 */
export function requirePermission(c: Context, permission: Permission, departmentId?: string | null): Principal {
  const principal = requirePrincipal(c);
  if (!can(principal.permissions, permission, departmentId)) {
    throw new HTTPException(403, { message: 'forbidden' });
  }
  return principal;
}
