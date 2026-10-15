type Row = { id: string; action: string; created_at: string; actor_name: string | null; details: string | null };
export function taskHistoryEvent(row: Row) {
  let details: any = {};
  try { details = JSON.parse(row.details || '{}'); } catch {}
  const values = (value: any) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: Record<string, string | null> = {};
    if (value.assignedTo === null || typeof value.assignedTo === 'string') result.assignedTo = value.assignedTo;
    if (value.dueDate === null || (typeof value.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.dueDate))) result.dueDate = value.dueDate;
    if (['pending', 'completed'].includes(value.status)) result.status = value.status;
    if (['low', 'normal', 'high', 'urgent'].includes(value.priority)) result.priority = value.priority;
    return result;
  };
  const status = row.action === 'task_status_changed';
  return { id: row.id, action: row.action, createdAt: row.created_at, actorName: row.actor_name || 'Former member',
    from: status ? (['pending', 'completed'].includes(details?.from) ? { status: details.from } : {}) : values(details?.from),
    to: status ? (['pending', 'completed'].includes(details?.to) ? { status: details.to } : {}) : values(details?.to),
  };
}
