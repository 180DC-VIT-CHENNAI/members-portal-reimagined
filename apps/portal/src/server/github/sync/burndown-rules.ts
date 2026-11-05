/*
 * Milestone burndown from what the integration already stores: each item's
 * created and closed times, plus the close/reopen entries of github_activity.
 * Pure: no database, no clock (the caller passes `today`).
 */

/** The longest stretch drawn, so a milestone without a due date cannot return years of days. */
export const BURNDOWN_MAX_DAYS = 366;
/** With a due date the chart starts at most this many days before it. */
export const BURNDOWN_LEAD_DAYS = 14;

export interface BurndownTransition {
  /** ISO-8601 time of a close (open: false) or reopen (open: true). */
  readonly at: string;
  readonly open: boolean;
}

export interface BurndownItem {
  /** ISO-8601, GitHub's created_at. */
  readonly createdAt: string;
  readonly state: 'open' | 'closed';
  /** GitHub's closed_at; null while open. */
  readonly closedAt: string | null;
  /** Close and reopen events from the activity log; only present for changes the webhook saw. */
  readonly transitions?: readonly BurndownTransition[];
}

export interface BurndownPoint {
  /** YYYY-MM-DD (UTC). */
  readonly date: string;
  /** Items open at the end of that day. */
  readonly open: number;
  /** Straight line from the first day's open count to 0 at the due date; null without a due date. */
  readonly ideal: number | null;
}

export interface BurndownSeries {
  readonly start: string;
  readonly end: string;
  /** Items in the milestone now. */
  readonly total: number;
  readonly points: readonly BurndownPoint[];
}

const DAY_MS = 86_400_000;

const dayOf = (iso: string): string => iso.slice(0, 10);

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

interface Step {
  readonly day: string;
  readonly open: boolean;
}

/**
 * The item's open/closed steps. The stored state wins over the activity log:
 * a close the log has not seen is added at closed_at, and closes after the last
 * recorded reopen are dropped for an item that is open now (a missed reopen).
 * Without activity, an item is open from creation until closed_at, so an item
 * reopened before the webhook was connected counts as open the whole time.
 */
function stepsOf(item: BurndownItem): Step[] {
  const created = dayOf(item.createdAt);
  const recorded = [...(item.transitions ?? [])]
    .filter((transition) => dayOf(transition.at) >= created)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((transition): Step => ({ day: dayOf(transition.at), open: transition.open }));
  const steps: Step[] = [{ day: created, open: true }, ...recorded];
  if (item.state === 'closed') {
    if (steps.at(-1)?.open) {
      const closed = item.closedAt ? dayOf(item.closedAt) : created;
      steps.push({ day: closed < created ? created : closed, open: false });
    }
  } else {
    while (steps.length > 1 && !steps.at(-1)?.open) steps.pop();
  }
  return steps;
}

function openAtEndOf(steps: readonly Step[], day: string): boolean {
  let open = false;
  for (const step of steps) {
    if (step.day > day) break;
    open = step.open;
  }
  return open;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Daily open counts from the milestone's first item (or 14 days before `dueOn`,
 * whichever is later) to the earlier of `today` and `dueOn`, with an ideal line
 * to 0 at `dueOn`. Pull requests count like issues, as in GitHub's own
 * milestone counts.
 */
export function computeBurndown(items: readonly BurndownItem[], dueOn: string | null, today: string): BurndownSeries {
  if (items.length === 0) return { start: today, end: today, total: 0, points: [] };

  const end = dueOn && dueOn < today ? dueOn : today;
  const first = items.map((item) => dayOf(item.createdAt)).reduce((a, b) => (a < b ? a : b));
  let start = dueOn && addDays(dueOn, -BURNDOWN_LEAD_DAYS) > first ? addDays(dueOn, -BURNDOWN_LEAD_DAYS) : first;
  if (start > end) start = end;
  if (daysBetween(start, end) >= BURNDOWN_MAX_DAYS) start = addDays(end, 1 - BURNDOWN_MAX_DAYS);

  const timelines = items.map(stepsOf);
  const length = daysBetween(start, end) + 1;
  const counts = Array.from({ length }, (_, offset) => {
    const day = addDays(start, offset);
    return { day, open: timelines.filter((steps) => openAtEndOf(steps, day)).length };
  });
  const startOpen = counts[0]?.open ?? 0;
  const span = dueOn ? daysBetween(start, dueOn) : 0;

  return {
    start,
    end,
    total: items.length,
    points: counts.map(({ day, open }, offset) => ({
      date: day,
      open,
      ideal: dueOn === null ? null : span <= 0 ? 0 : round2(Math.max(0, startOpen * (1 - offset / span))),
    })),
  };
}
