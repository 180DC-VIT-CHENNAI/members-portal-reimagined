export function taskSchedule(body: Record<string, unknown>): { dueDate: string | null; priority: string } {
  const dueDate = body.dueDate == null || body.dueDate === '' ? null : body.dueDate;
  if (dueDate !== null && (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) throw new Error('Due date must be a valid YYYY-MM-DD date');
  const priority = body.priority === undefined ? 'normal' : body.priority;
  if (typeof priority !== 'string' || !['low', 'normal', 'high', 'urgent'].includes(priority)) throw new Error('Invalid task priority');
  return { dueDate: dueDate as string | null, priority };
}
