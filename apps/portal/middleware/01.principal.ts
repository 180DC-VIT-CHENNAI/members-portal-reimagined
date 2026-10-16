import { defineMiddleware } from 'void';
import { getUser } from 'void/auth';
import { loadPrincipal, type Principal } from '../src/server/principal';

declare module 'void' {
  interface CloudContextVariables {
    /** Signed-in member with access; null when signed out or deactivated. */
    principal: Principal | null;
  }
}

export default defineMiddleware(async (c, next) => {
  const user = c.req.path.startsWith('/api/') ? getUser() : null;
  c.set('principal', user ? await loadPrincipal(user.id) : null);
  await next();
});
