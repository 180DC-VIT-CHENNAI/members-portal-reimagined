export function hourlyLimit(configured?: string): number {
  const value = Number(configured);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 500;
}

/** Campaigns reserve 10% of the shared hourly allowance for direct mail. */
export function campaignBudget(limit: number, hourlyCount: number, now: Date): number {
  const remaining = Math.max(0, limit - Math.floor(limit / 10) - hourlyCount);
  if (remaining === 0) return 0;
  return Math.min(15, Math.ceil(remaining / Math.max(1, 60 - now.getUTCMinutes())));
}
