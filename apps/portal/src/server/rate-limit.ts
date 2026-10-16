import { rateLimits } from '@schema';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { sql } from 'drizzle-orm';
import { db } from 'void/db';

export function clientIp(c: Context): string {
  return c.req.header('CF-Connecting-IP') || 'unknown';
}

/**
 * Atomic fixed-window limit per client IP and endpoint, shared by every
 * isolate (same policy as the old Worker's `consumeRateLimit`). Throws 429
 * with a Retry-After header once `maximum` requests were made in the window.
 */
export async function rateLimit(c: Context, endpoint: string, maximum: number, windowSeconds: number): Promise<void> {
  const expired = sql`unixepoch(${rateLimits.windowStart}) + ${windowSeconds} <= unixepoch('now')`;
  const [row] = await db
    .insert(rateLimits)
    .values({ ip: clientIp(c), endpoint, count: 1, windowStart: sql`datetime('now')` })
    .onConflictDoUpdate({
      target: [rateLimits.ip, rateLimits.endpoint],
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE MIN(${rateLimits.count} + 1, ${maximum + 1}) END`,
        windowStart: sql`CASE WHEN ${expired} THEN datetime('now') ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning({
      count: rateLimits.count,
      retryAfter: sql<number>`MAX(1, ${windowSeconds} - (unixepoch('now') - unixepoch(${rateLimits.windowStart})))`,
    });
  if (row && row.count > maximum) {
    throw new HTTPException(429, {
      res: new Response('rate_limited', { status: 429, headers: { 'Retry-After': String(row.retryAfter) } }),
    });
  }
}
