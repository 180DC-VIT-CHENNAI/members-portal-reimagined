import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../lib/api';
export default function TaskScheduleEditor({ task, projectId, authToken, onSaved, assignees = [] }: { assignees?: { id: string; name: string }[]; task: { id: string; title: string; due_date: string | null; priority: string; assigned_to: string | null; assigned_name?: string }; projectId: string; authToken: string; onSaved: () => void }) {
  const lifetime = useRef(0);
  useEffect(() => () => { lifetime.current++; }, []);
  const [editing, setEditing] = useState(false);
  const [dueDate, setDueDate] = useState(task.due_date || '');
  const [expected, setExpected] = useState({ assignedTo: task.assigned_to, dueDate: task.due_date, priority: task.priority });
  const [assignedTo, setAssignedTo] = useState(task.assigned_to || '');
  const [priority, setPriority] = useState(task.priority || 'normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!editing) return <button className="btn outline" onClick={() => { setDueDate(task.due_date || ''); setPriority(task.priority || 'normal'); setAssignedTo(task.assigned_to || ''); setExpected({ assignedTo: task.assigned_to, dueDate: task.due_date, priority: task.priority }); setError(''); setEditing(true); }}>Edit task details</button>;
  return <form onSubmit={async event => {
    const version = lifetime.current;
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/details`), { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ dueDate: dueDate || null, priority, assignedTo: assignedTo || null, expected }) });
      const data = await response.json();
      if (version !== lifetime.current) return;
      if (!response.ok || !data.success) throw new Error(data.error || 'Schedule update failed');
      setEditing(false); onSaved();
    } catch (err) { if (version !== lifetime.current) return; setError(err instanceof Error ? err.message : 'Schedule update failed'); }
    finally { if (version === lifetime.current) setBusy(false); }
  }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
    <label>Task owner <select className="input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} disabled={busy}>
      <option value="">Unassigned</option>
      {task.assigned_to && !assignees.some(person => person.id === task.assigned_to) && <option value={task.assigned_to}>{task.assigned_name || 'Current owner'}</option>}
      {assignees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
    </select></label>
    <label>Task due date <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={busy} /></label>
    <label>Priority <select className="input" value={priority} onChange={e => setPriority(e.target.value)} disabled={busy}>{['low', 'normal', 'high', 'urgent'].map(p => <option key={p}>{p}</option>)}</select></label>
    <button className="btn outline" disabled={busy}>Save task details</button>
    <button className="btn outline" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
    {error && <><p role="alert">{error}</p><button className="btn outline" type="button" disabled={busy} onClick={() => { setEditing(false); onSaved(); }}>Reload task</button></>}
  </form>;
}
