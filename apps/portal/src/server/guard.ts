import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getUser } from 'void/auth';
import { readMaintenance } from './maintenance';
import { can, type Permission } from './permissions';
import { loadPrincipal, type Principal } from './principal';

declare module 'void' {
  interface CloudContextVariables {
    /** Signed-in member with access; null when signed out or deactivated. Cached per request. */
    principal: Principal | null;
    /** True when maintenance mode is on and the principal lacks `site.maintenance`. */
    maintenanceLocked: boolean;
  }
}

/**
 * The signed-in member with access, or 401.
 *
 * Resolved here rather than in global middleware: any file in `middleware/`
 * makes Void run the Worker before every static asset, so the SPA would no
 * longer be served from Workers Assets without a Worker invocation.
 *
 * While maintenance mode is on, only people with `site.maintenance` get
 * through; everyone else gets 503 (the old Worker's power_level >= 100 rule).
 */
export async function requirePrincipal(c: Context): Promise<Principal> {
  let principal = c.get('principal') as Principal | null | undefined;
  if (principal === undefined) {
    const user = getUser();
    const [loaded, maintenance] = user ? await Promise.all([loadPrincipal(user.id), readMaintenance()]) : [null, null];
    principal = loaded;
    c.set('principal', principal);
    c.set('maintenanceLocked', Boolean(principal && maintenance?.enabled && !can(principal.permissions, 'site.maintenance')));
  }
  if (!principal) throw new HTTPException(401, { message: 'unauthorized' });
  if (c.get('maintenanceLocked')) throw new HTTPException(503, { message: 'maintenance' });
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
