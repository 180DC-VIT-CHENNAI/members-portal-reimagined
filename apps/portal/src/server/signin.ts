/** Shared sign-in rules, used by the Better Auth hooks and the dev test login. */

const CAN_SIGN_UP = "('invited', 'active', 'on_leave')";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True when an account may be created for this verified email. */
export async function isInvited(db: D1Database, email: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM people WHERE email = ?1 AND status IN ${CAN_SIGN_UP}`)
    .bind(normalizeEmail(email))
    .first<{ ok: number }>();
  return row !== null;
}

/** Link the auth user to the person and turn "invited" into "active". */
export async function activateOnFirstSignIn(db: D1Database, authUserId: string, email: string): Promise<void> {
  await db
    .prepare(
      `UPDATE people SET auth_user_id = ?1,
         status = CASE status WHEN 'invited' THEN 'active' ELSE status END,
         activated_at = COALESCE(activated_at, datetime('now')),
         status_changed_at = CASE status WHEN 'invited' THEN datetime('now') ELSE status_changed_at END,
         updated_at = datetime('now')
       WHERE email = ?2 AND auth_user_id IS NULL`,
    )
    .bind(authUserId, normalizeEmail(email))
    .run();
}

/** True when this auth user belongs to a person who still has access. */
export async function mayHoldSession(db: D1Database, authUserId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM people WHERE auth_user_id = ?1 AND status IN ('active', 'on_leave')`)
    .bind(authUserId)
    .first<{ ok: number }>();
  return row !== null;
}

/** End every session of an auth user (used when access is withdrawn). */
export async function revokeSessions(db: D1Database, authUserId: string | null): Promise<void> {
  if (!authUserId) return;
  await db.prepare('DELETE FROM session WHERE userId = ?1').bind(authUserId).run();
}
