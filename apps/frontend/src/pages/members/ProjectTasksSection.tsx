import TaskHistory from './TaskHistory';
import TaskScheduleEditor from './TaskScheduleEditor';
import { useState, useEffect, useRef } from "react";
import { apiUrl } from "../../lib/api";

export default function ProjectTasksSection({ authToken, projectId, projectStatus, canManageTasks, isBoard, assignees = [] }: { authToken: string; projectId: string; projectStatus: string; canManageTasks: boolean; isBoard: boolean; assignees?: { id: string; name: string }[] }) {
  const latestContext = useRef({ projectId, authToken });
  latestContext.current = { projectId, authToken };
  const isCurrent = () => latestContext.current.projectId === projectId && latestContext.current.authToken === authToken;
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assignedTo, setAssignedTo] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);
  const [completeAllBusy, setCompleteAllBusy] = useState(false);
  const [completeProjBusy, setCompleteProjBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingTask, setUpdatingTask] = useState("");

  async function loadTasks() {
    try {
      const res = await fetch(apiUrl(`/api/projects/${projectId}/tasks`), { headers: { Authorization: `Bearer ${authToken}` } });
      const data = await res.json();
      if (!isCurrent()) return;
      if (!res.ok || !data.success) {
        setTasks([]);
        throw new Error(data.error || "Unable to load tasks");
      }
      setTasks(data.data || []);
      setError("");
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : "Unable to load tasks");
    } finally { if (isCurrent()) setLoading(false); }
  }

  useEffect(() => { setLoading(true); setTasks([]); setUpdatingTask(""); setTaskBusy(false); setCompleteAllBusy(false); setCompleteProjBusy(false); loadTasks(); }, [projectId, authToken]);

  async function updateStatus(task: any) {
    setUpdatingTask(task.id);
    setError("");
    try {
      const res = await fetch(apiUrl(`/api/projects/${projectId}/tasks/${task.id}`), {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ status: task.status === "completed" ? "pending" : "completed" }),
      });
      const data = await res.json();
      if (!isCurrent()) return;
      if (!res.ok || !data.success) throw new Error(data.error || "Task update failed");
      await loadTasks();
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : "Task update failed. Try again.");
    } finally { if (isCurrent()) setUpdatingTask(""); }
  }

  const allDone = tasks.length > 0 && tasks.every((t: any) => t.status === "completed");

  return (
    <div style={{ marginTop: "1rem" }}>
      {error && <div role="alert" style={{ color: "var(--status-error)", marginBottom: 12 }}>{error} <button className="btn outline" onClick={loadTasks}>Refresh tasks</button></div>}
      {loading && <p role="status">Loading tasks…</p>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
           <span className="material-symbols-outlined" style={{ color: "var(--text-tertiary)", fontSize: 20 }}>checklist</span>
           <strong style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>Tasks ({tasks.filter((t: any) => t.status === "completed").length}/{tasks.length})</strong>
        </div>
        
        {projectStatus !== "completed" && (
          <div style={{ display: "flex", gap: 8 }}>
            {canManageTasks && tasks.length > 0 && !allDone && (
              <button className="btn outline" style={{ padding: "6px 12px", fontSize: 11 }} disabled={completeAllBusy} onClick={async () => {
                setCompleteAllBusy(true);
                try {
                  const res = await fetch(apiUrl(`/api/projects/${projectId}/tasks/complete-all`), { method: "POST", headers: { Authorization: `Bearer ${authToken}` } });
                  const data = await res.json();
      if (!isCurrent()) return;
                  if (data.success) loadTasks(); else alert(data.error);
                } finally { if (isCurrent()) setCompleteAllBusy(false); }
              }}>Complete All</button>
            )}
            {isBoard && projectStatus !== "completed" && (allDone || tasks.length === 0) && (
              <button className="btn" style={{ padding: "6px 12px", fontSize: 11 }} disabled={completeProjBusy} onClick={async () => {
                if (!confirm("Mark this project as fully completed?")) return;
                setCompleteProjBusy(true);
                try {
                  const res = await fetch(apiUrl(`/api/projects/${projectId}/complete`), { method: "POST", headers: { Authorization: `Bearer ${authToken}` } });
                  const data = await res.json();
      if (!isCurrent()) return;
                  if (data.success) { alert("Project archived as completed."); loadTasks(); window.location.reload(); } else alert(data.error);
                } finally { if (isCurrent()) setCompleteProjBusy(false); }
              }}>Finish Project</button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.25rem" }}>
        {tasks.map((t: any) => (
          <div key={t.id} style={{ 
            padding: "0.75rem 1rem", background: t.status === "completed" ? "transparent" : "var(--surface)", 
            borderRadius: 12, border: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center",
            opacity: t.status === "completed" ? 0.6 : 1
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1 }}>
              <span className="material-symbols-outlined" style={{ color: t.status === "completed" ? "var(--status-success)" : "var(--text-tertiary)", fontSize: 20 }}>
                {t.status === "completed" ? "check_circle" : "radio_button_unchecked"}
              </span>
              <div>
                 <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", textDecoration: t.status === "completed" ? "line-through" : "none" }}>{t.title}</div>
                 {t.description && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{t.description}</div>}
                 <div style={{ fontSize: 12 }}>Priority: {t.priority || "normal"}{t.due_date ? ` · Task due ${t.due_date}` : " · No task due date"}</div>
                 {canManageTasks && <TaskScheduleEditor key={`${projectId}-${authToken}-${t.id}`} assignees={assignees} task={t} projectId={projectId} authToken={authToken} onSaved={() => void loadTasks()} />}
                 <TaskHistory key={`history-${projectId}-${authToken}-${t.id}`} projectId={projectId} taskId={t.id} taskTitle={t.title} authToken={authToken} people={assignees} />
                 {t.assigned_name && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Assigned to {t.assigned_name}</div>}
              </div>
            </div>
            {(t.can_update ?? canManageTasks) && (
              <button className="header-action-btn" style={{ minWidth: 44, minHeight: 44 }}
                title={t.status === "completed" ? "Reopen task" : "Mark as done"}
                aria-label={`${t.status === "completed" ? "Reopen" : "Complete"} ${t.title}`}
                disabled={!!updatingTask} onClick={() => updateStatus(t)}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{t.status === "completed" ? "undo" : "task_alt"}</span>
              </button>
            )}
          </div>
        ))}
        {tasks.length === 0 && !loading && !error && <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-tertiary)", border: "1px dashed var(--outline-variant)", borderRadius: 12, fontSize: 13 }}>No tasks assigned.</div>}
      </div>

      {canManageTasks && projectStatus !== "completed" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--surface-container-low)", padding: "1rem", borderRadius: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Create New Task</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Task title..." value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
            <input className="input" style={{ flex: 2, minWidth: 260 }} placeholder="Optional details..." value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} />
            <select className="input" aria-label="Task assignee" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
              <option value="">Unassigned</option>
              {assignees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
            <label>Task due date <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
            <label>Priority <select className="input" value={priority} onChange={e => setPriority(e.target.value)}>{['low', 'normal', 'high', 'urgent'].map(p => <option key={p}>{p}</option>)}</select></label>
            <button className="btn outline" style={{ padding: "0 1rem", minHeight: 42 }} disabled={taskBusy} onClick={async () => {
              if (!taskTitle.trim()) return alert("Task title required");
              setTaskBusy(true);
              try {
                const res = await fetch(apiUrl(`/api/projects/${projectId}/tasks`), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ title: taskTitle.trim(), description: taskDesc.trim() || null, assignedTo: assignedTo || null, dueDate: dueDate || null, priority }) });
                const data = await res.json();
      if (!isCurrent()) return;
                if (data.success) { setTaskTitle(""); setTaskDesc(""); setAssignedTo(""); setDueDate(""); setPriority("normal"); loadTasks(); } else setError(data.error || "Task creation failed");
              } catch { if (!isCurrent()) return; setError("Task creation failed. Check your connection and try again."); }
              finally { if (isCurrent()) setTaskBusy(false); }
            }}>Add Task</button>
          </div>
        </div>
      )}
    </div>
  );
}
