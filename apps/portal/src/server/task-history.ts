import type { TaskPriority, TaskStatus } from '@schema';

/** Audit actions shown as a task's history. */
export const TASK_HISTORY_ACTIONS = ['task.create', 'task.update', 'task.status', 'task.comment', 'task.comment.remove'] as const;

const STATUSES: readonly string[] = ['pending', 'blocked', 'completed'] satisfies TaskStatus[];
const PRIORITIES: readonly string[] = ['low', 'normal', 'high', 'urgent'] satisfies TaskPriority[];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isStatus = (value: unknown): value is TaskStatus => STATUSES.some((status) => status === value);
const isPriority = (value: unknown): value is TaskPriority => PRIORITIES.some((priority) => priority === value);

export interface TaskValues {
  title?: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  descriptionChanged?: true;
}

export interface HistoryRow {
  readonly id: number;
  readonly action: string;
  readonly createdAt: string;
  readonly actorName: string | null;
  readonly details: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The people entries refer to, so their names can be looked up once. */
export function historyPersonIds(rows: readonly HistoryRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row.details)) continue;
    for (const side of [row.details.from, row.details.to]) {
      if (isRecord(side) && typeof side.assigneeId === 'string') ids.add(side.assigneeId);
    }
  }
  return [...ids];
}

function values(side: unknown, names: ReadonlyMap<string, string>): TaskValues {
  if (!isRecord(side)) return {};
  const out: TaskValues = {};
  if (typeof side.title === 'string') out.title = side.title;
  if (side.assigneeId === null || typeof side.assigneeId === 'string') {
    out.assigneeId = side.assigneeId;
    out.assigneeName = side.assigneeId === null ? null : (names.get(side.assigneeId) ?? null);
  }
  if (side.dueDate === null || (typeof side.dueDate === 'string' && DAY.test(side.dueDate))) out.dueDate = side.dueDate;
  if (isPriority(side.priority)) out.priority = side.priority;
  if (isStatus(side.status)) out.status = side.status;
  if ('description' in side) out.descriptionChanged = true;
  return out;
}

const statusOnly = (value: unknown): TaskValues => (isStatus(value) ? { status: value } : {});

/**
 * One audit entry as a task history event. Only known fields with valid values
 * survive; comment text, comment ids and the raw details never do.
 */
export function taskHistoryEvent(row: HistoryRow, names: ReadonlyMap<string, string>) {
  const details = isRecord(row.details) ? row.details : {};
  const statusChange = row.action === 'task.status';
  return {
    id: row.id,
    action: row.action,
    createdAt: row.createdAt,
    actorName: row.actorName ?? 'System',
    from: statusChange ? statusOnly(details.from) : values(details.from, names),
    to: statusChange ? statusOnly(details.to) : values(details.to, names),
    bulk: statusChange && details.bulk === true,
  };
}
