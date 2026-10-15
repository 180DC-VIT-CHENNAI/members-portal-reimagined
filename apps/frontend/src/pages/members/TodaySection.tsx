import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../lib/api';
import './TodaySection.css';
type Queue = {
  generatedAt: string;
  tasks: { id: string; project_id: string; title: string; project_name: string; project_deadline: string | null; due_date?: string | null; priority?: string }[];
  meetings: { id: string; type: string; title: string; scheduled_at: string; meet_link: string | null }[];
  hasMoreTasks: boolean; hasMoreMeetings: boolean;
  attention: { incomingTransfers: number; accountRequests?: number };
};
function date(value: string) {
  const normalized = value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T') + 'Z';
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : 'Date unavailable';
}
export default function TodaySection({ authToken, onOpen }: { authToken: string; onOpen: (panel: string) => void }) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [mutating, setMutating] = useState<string | null>(null);
  const currentToken = useRef(authToken);
  currentToken.current = authToken;
  async function complete(task: Queue['tasks'][number]) {
    const credential = authToken;
    setMutating(task.id); setError('');
    try {
      const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(task.project_id)}/tasks/${encodeURIComponent(task.id)}`), {
        method: 'PUT', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }), signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not complete task');
      if (currentToken.current === credential) setRefresh(value => value + 1);
    } catch (err) {
      if (currentToken.current === credential) setError(err instanceof Error ? err.message : 'Could not complete task');
    } finally { if (currentToken.current === credential) setMutating(null); }
  }

  useEffect(() => { setMutating(null); }, [authToken]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setQueue(null);
    (async () => {
      try {
        const response = await fetch(apiUrl('/api/work-queue'), { headers: { Authorization: `Bearer ${authToken}` }, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load your work queue');
        if (!controller.signal.aborted) setQueue(data);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load your work queue'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') setRefresh(value => value + 1); }, 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [authToken, refresh]);
  return <section className="dashboard-card today-queue" style={{ gridColumn: '1 / -1', minWidth: 0, overflowWrap: 'anywhere' }} aria-labelledby="today-heading">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <h2 id="today-heading">Today</h2><button type="button" className="btn outline" disabled={loading || mutating !== null} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
    </div>
    {loading && <p role="status">Loading your work…</p>}
    {error && <p role="alert">{error}</p>}
    {queue && <>
      <p style={{ color: 'var(--text-secondary)' }}>Updated {date(queue.generatedAt)}</p>
      <h3>My open tasks</h3>
      {!queue.tasks.length && <p>No open assigned tasks in your current projects.</p>}
      <ul>{queue.tasks.map(task => <li key={task.id} style={{ marginBottom: 12 }}><strong>{task.title}</strong> — {task.project_name}{task.due_date && <span> · Task due {task.due_date}</span>}{task.priority && <span> · {task.priority} priority</span>}{task.project_deadline && <span> · Project due {date(task.project_deadline)}</span>} <button type="button" className="btn outline" disabled={mutating !== null} onClick={() => complete(task)} aria-label={`Complete ${task.title}`}>{mutating === task.id ? 'Completing…' : 'Complete'}</button></li>)}</ul>
      <button type="button" className="btn outline" onClick={() => onOpen('projects')}>Open projects{queue.hasMoreTasks ? ' — more tasks available' : ''}</button>
      <h3>Meetings in the next seven days</h3>
      {!queue.meetings.length && <p>No upcoming meetings for your current access.</p>}
      <ul>{queue.meetings.map(meet => <li key={`${meet.type}-${meet.id}`} style={{ marginBottom: 12 }}><strong>{meet.title}</strong> · {date(meet.scheduled_at)}{meet.meet_link && /^https:\/\//i.test(meet.meet_link) && <> · <a href={meet.meet_link} target="_blank" rel="noopener noreferrer">Join meeting</a></>}</li>)}</ul>
      {queue.hasMoreMeetings && <p>More meetings are available in the meeting sections.</p>}
      <h3>Needs attention</h3>
      {queue.attention.incomingTransfers > 0 && <p><button type="button" className="btn outline" onClick={() => onOpen('transfers')}>{queue.attention.incomingTransfers} role invitation(s)</button></p>}
      {(queue.attention.accountRequests || 0) > 0 && <p><button type="button" className="btn outline" onClick={() => onOpen('admin')}>{queue.attention.accountRequests} account request(s)</button></p>}
      {!queue.attention.incomingTransfers && !queue.attention.accountRequests && <p>No pending invitations or account approvals.</p>}
    </>}
  </section>;
}
