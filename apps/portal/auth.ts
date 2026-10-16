import { APIError } from 'better-auth/api';
import { defineAuth } from 'void/auth';
import { activateOnFirstSignIn, isInvited, mayHoldSession, normalizeEmail } from './src/server/signin.ts';

/**
 * Google-only, invite-only sign-in. Nobody can create an account unless an
 * admin first added their email to `people`; people without access cannot
 * start a session even if their auth account still exists.
 */
export default defineAuth(({ defaults, env }) => {
  const db = env.DB as D1Database;
  return {
    ...defaults,
    emailAndPassword: { enabled: false },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!user.emailVerified) throw new APIError('FORBIDDEN', { message: 'email_not_verified' });
            if (!(await isInvited(db, user.email))) throw new APIError('FORBIDDEN', { message: 'not_invited' });
            return { data: { ...user, email: normalizeEmail(user.email) } };
          },
          after: async (user) => {
            await activateOnFirstSignIn(db, user.id, user.email);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            if (!(await mayHoldSession(db, session.userId))) {
              throw new APIError('FORBIDDEN', { message: 'access_revoked' });
            }
          },
        },
      },
    },
  };
});
