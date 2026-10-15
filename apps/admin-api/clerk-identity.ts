import { isAllowedWebOrigin } from './origin-policy.ts';

export class ClerkIdentityError extends Error {
  status: 401 | 503;
  constructor(status: 401 | 503, message: string) { super(message); this.status = status; }
}

/** Only a verified, active Clerk session from an approved frontend proves identity. */
export async function verifiedClerkIdentity(
  token: string,
  secretKey: string | undefined,
  origins: { configured?: string; defaults: readonly string[]; development: boolean },
  verify: (token: string, options: { secretKey: string }) => Promise<any>,
): Promise<string> {
  if (!secretKey) throw new ClerkIdentityError(503, 'Google sign-in is not configured');
  let claims: any;
  try { claims = await verify(token, { secretKey }); }
  catch { throw new ClerkIdentityError(401, 'Invalid or expired Clerk session'); }
  if (!claims || typeof claims.sub !== 'string' || !claims.sub.startsWith('user_') ||
      typeof claims.sid !== 'string' || !claims.sid.startsWith('sess_') ||
      (claims.sts !== undefined && claims.sts !== 'active')) {
    throw new ClerkIdentityError(401, 'Invalid or incomplete Clerk session');
  }
  const origin = claims.azp;
  let local = false;
  if (typeof origin === 'string' && origins.development) {
    try {
      const url = new URL(origin);
      local = ['http:', 'https:'].includes(url.protocol) &&
        ['localhost', '127.0.0.1'].includes(url.hostname) && url.origin === origin;
    } catch { /* fail closed */ }
  }
  if (typeof origin !== 'string' || (!local && !isAllowedWebOrigin(origin, origins.configured, origins.defaults))) {
    throw new ClerkIdentityError(401, 'Clerk session was issued for an unapproved frontend');
  }
  return claims.sub;
}
