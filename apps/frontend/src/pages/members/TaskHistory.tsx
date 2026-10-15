import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../lib/api';
type Values = { assignedTo?: string | null; dueDate?: string | null; priority?: string; status?: string };
type Event = { id: string; action: string; createdAt: string; actorName: string; from: Values; to: Values };
export default function TaskHistory({ projectId, taskId, taskTitle, authToken, people }: { projectId: string; taskId: string; taskTitle: string; authToken: string; people: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  useEffect(() => () => { epoch.current++; }, []);
  async function load(next: string | null = null) {
    const version = ++epoch.current;
    setBusy(true); setError('');
    try {
      const path = `/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/history${next ? `?cursor=${encodeURIComponent(next)}` : ''}`;
      const response = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${authToken}` } });
      const data = await response.json().catch(() => null);
      if (version !== epoch.current) return;
      if (!response.ok || !data?.success || !Array.isArray(data?.data) || !data.data.every((event: Event) => event && typeof event.id === 'string' && typeof event.createdAt === 'string' && typeof event.actorName === 'string' && event.from && typeof event.from === 'object' && event.to && typeof event.to === 'object')) {
        if ([401, 403, 404].includes(response.status)) { setEvents([]); setCursor(null); }
        throw new Error(typeof data?.error === 'string' ? data.error : 'Could not load task history');
      }
      setEvents(previous => next ? [...new Map([...previous, ...data.data].map(event => [event.id, event])).values()] : data.data);
      setCursor(data.nextCursor || null);
    } catch (err) { if (version === epoch.current) setError(err instanceof Error ? err.message : 'Could not load task history'); }
    finally { if (version === epoch.current) setBusy(false); }
  }
  function describe(values: Values) {
    return [
      values.status === undefined ? null : `Status: ${values.status}`,
      values.assignedTo === undefined ? null : `Owner: ${values.assignedTo === null ? 'Unassigned' : people.find(person => person.id === values.assignedTo)?.name || 'Member no longer listed'}`,
      values.dueDate === undefined ? null : `Due: ${values.dueDate || 'No task due date'}`,
      values.priority === undefined ? null : `Priority: ${values.priority}`,
    ].filter(Boolean).join(' · ') || 'Details unavailable';
  }
  return <div style={{ marginTop: 8 }}>
    <button className="btn outline" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} history for ${taskTitle}`} onClick={() => { setOpen(value => !value); if (!open) void load(); }}>Task history</button>
    {open && <section aria-label={`History for ${taskTitle}`}>
      <button className="btn outline" disabled={busy} onClick={() => void load()}>Refresh history</button>
      {busy && <p role="status">Loading task history…</p>}
      {error && <p role="alert">{error}</p>}
      {!busy && !error && !events.length && <p>No recorded task changes. Earlier actions may predate history tracking.</p>}
      <ol>{events.map(event => <li key={event.id} style={{ marginTop: 12, overflowWrap: 'anywhere' }}>
        <strong>{event.actorName}</strong> · {new Date(event.createdAt.replace(' ', 'T') + 'Z').toLocaleString()}
        <div>{event.action === 'task_comment_added' ? 'Comment added' : event.action === 'task_comment_removed' ? 'Comment removed' : `${describe(event.from)} → ${describe(event.to)}`}</div>
      </li>)}</ol>
      {cursor && <button className="btn outline" disabled={busy} onClick={() => void load(cursor)}>Load older changes</button>}
    </section>}
  </div>;
}
