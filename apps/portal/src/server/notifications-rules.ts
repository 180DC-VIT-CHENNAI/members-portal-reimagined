export const PAGE_SIZE = 30;
/** The unread count reads at most this many rows and reports `capped` beyond it. */
export const COUNT_LIMIT = 99;

const DAY_MS = 86_400_000;

/** "Approaching" means due today or tomorrow, as UTC calendar dates. */
export function reminderDates(now: Date): [today: string, tomorrow: string] {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return [day(now.getTime()), day(now.getTime() + DAY_MS)];
}

export function departmentsByProject(rows: readonly { projectId: string; departmentId: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { projectId, departmentId } of rows) out.set(projectId, [...(out.get(projectId) ?? []), departmentId]);
  return out;
}
