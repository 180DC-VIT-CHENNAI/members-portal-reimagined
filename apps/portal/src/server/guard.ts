import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getUser } from 'void/auth';
import { can, type Permission } from './permissions';
import { loadPrincipal, type Principal } from './principal';

declare module 'void' {
  interface CloudContextVariables {
    /** Signed-in member with access; null when signed out or deactivated. Cached per request. */
    principal: Principal | null;
  }
}

/**
 * The signed-in member with access, or 401.
 *
 * Resolved here rather than in global middleware: any file in `middleware/`
 * makes Void run the Worker before every static asset, so the SPA would no
 * longer be served from Workers Assets without a Worker invocation.
 */
export async function requirePrincipal(c: Context): Promise<Principal> {
  let principal = c.get('principal') as Principal | null | undefined;
  if (principal === undefined) {
    const user = getUser();
    principal = user ? await loadPrincipal(user.id) : null;
    c.set('principal', principal);
  }
  if (!principal) throw new HTTPException(401, { message: 'unauthorized' });
  return principal;
}

/**
 * The signed-in member holding `permission` (for `departmentId` when given),
 * or 401/403.
 */
export async function requirePermission(c: Context, permission: Permission, departmentId?: string | null): Promise<Principal> {
  const principal = await requirePrincipal(c);
  if (!can(principal.permissions, permission, departmentId)) {
    throw new HTTPException(403, { message: 'forbidden' });
  }
  return principal;
}
