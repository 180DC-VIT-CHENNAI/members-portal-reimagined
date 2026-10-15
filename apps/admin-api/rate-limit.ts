/** Atomic, persistent fixed-window limit shared by every Worker isolate. */
export async function consumeRateLimit(db: any, ip: string, endpoint: string, maximum: number, windowSeconds = 60): Promise<{ allowed: boolean; retryAfter: number }> {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) {
    throw new Error('Invalid rate limit policy');
  }
  const row = await db.prepare(`
    INSERT INTO rate_limits (ip, endpoint, count, window_start)
    VALUES (?, ?, 1, datetime('now'))
    ON CONFLICT(ip, endpoint) DO UPDATE SET
      count = CASE WHEN COALESCE(unixepoch(window_start), 0) + ? <= unixepoch('now')
        THEN 1 ELSE MIN(COALESCE(count, 0) + 1, ? + 1) END,
      window_start = CASE WHEN COALESCE(unixepoch(window_start), 0) + ? <= unixepoch('now')
        THEN datetime('now') ELSE window_start END
    RETURNING count, MAX(1, ? - (unixepoch('now') - unixepoch(window_start))) AS retry_after
  `).bind(ip, endpoint, windowSeconds, maximum, windowSeconds, windowSeconds).first();
  if (!row || !Number.isFinite(row.count) || !Number.isFinite(row.retry_after)) {
    throw new Error('Rate limit state unavailable');
  }
  return { allowed: row.count <= maximum, retryAfter: row.count <= maximum ? 0 : row.retry_after };
}
