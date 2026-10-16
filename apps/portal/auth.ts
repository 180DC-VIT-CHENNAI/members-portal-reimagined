import { APIError } from 'better-auth/api';
import { defineAuth } from 'void/auth';

/** Statuses that may hold a session. invited becomes active on first sign-in. */
const CAN_SIGN_IN = "('invited', 'active', 'on_leave')";

/**
 * Google-only, invite-only sign-in. Nobody can create an account unless an
 * admin first added their email to `people`; deactivated people cannot start
 * a session even if their auth account still exists.
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
            const email = user.email.trim().toLowerCase();
            if (!user.emailVerified) throw new APIError('FORBIDDEN', { message: 'email_not_verified' });
            const person = await db
              .prepare(`SELECT id FROM people WHERE email = ?1 AND status IN ${CAN_SIGN_IN}`)
              .bind(email)
              .first<{ id: string }>();
            if (!person) throw new APIError('FORBIDDEN', { message: 'not_invited' });
            return { data: { ...user, email } };
          },
          after: async (user) => {
            await db
              .prepare(
                `UPDATE people SET auth_user_id = ?1,
                   status = CASE status WHEN 'invited' THEN 'active' ELSE status END,
                   activated_at = COALESCE(activated_at, datetime('now')),
                   status_changed_at = CASE status WHEN 'invited' THEN datetime('now') ELSE status_changed_at END,
                   updated_at = datetime('now')
                 WHERE email = ?2 AND auth_user_id IS NULL`,
              )
              .bind(user.id, user.email.toLowerCase())
              .run();
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const person = await db
              .prepare(`SELECT id FROM people WHERE auth_user_id = ?1 AND status IN ('active', 'on_leave')`)
              .bind(session.userId)
              .first<{ id: string }>();
            if (!person) throw new APIError('FORBIDDEN', { message: 'access_revoked' });
          },
        },
      },
    },
  };
});
