import { useState, useEffect } from "react";
import { apiUrl } from "../../lib/api";
import CreateProjectSection from "./CreateProjectSection";
import ProjectTasksSection from "./ProjectTasksSection";

export default function ProjectsSection({ authToken, departments, allUsers, powerLevel, departmentId }: { authToken: string; departments: any[]; allUsers: any[]; powerLevel: number; departmentId: string | null }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [deptMembers, setDeptMembers] = useState<any[]>([]);
  const [assignProjectId, setAssignProjectId] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRoleName, setAssignRoleName] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [yearFilter, setYearFilter] = useState("");

  const canManage = powerLevel >= 50 && departmentId;
  const isBoard = powerLevel >= 100;

  async function load() {
    const [projRes, membersRes] = await Promise.all([
      fetch(apiUrl("/api/projects"), { headers: { Authorization: `Bearer ${authToken}` } }),
      isBoard
        ? fetch(apiUrl("/api/users"), { headers: { Authorization: `Bearer ${authToken}` } })
        : departmentId
          ? fetch(apiUrl(`/api/departments/${departmentId}/members`), { headers: { Authorization: `Bearer ${authToken}` } })
          : Promise.resolve(null),
    ]);
    const projData = await projRes.json();
    if (projData.success) setProjects(projData.data || []);
    if (membersRes) {
      const membersData = await membersRes.json();
      setDeptMembers(membersData.success ? (membersData.data || []) : []);
    }
  }

  useEffect(() => { load(); }, []);

  const availableMembers = isBoard ? allUsers : deptMembers;

  const statusFiltered = showCompleted
    ? projects.filter((p: any) => p.status === "completed")
    : projects.filter((p: any) => p.status !== "completed");

  const query = searchQuery.toLowerCase();
  const searched = query
    ? statusFiltered.filter((p: any) =>
        (p.name || "").toLowerCase().includes(query) ||
        (p.description || "").toLowerCase().includes(query) ||
        (p.company_org || "").toLowerCase().includes(query)
      )
    : statusFiltered;

  const yearFiltered = yearFilter
    ? searched.filter((p: any) => (p.year || "Unspecified") === yearFilter)
    : searched;

  const sorted = [...yearFiltered].sort((a: any, b: any) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return sortOrder === "newest" ? db - da : da - db;
  });

  const yearSet = new Set<string>();
  statusFiltered.forEach((p: any) => yearSet.add(p.year || "Unspecified"));
  const availableYears = Array.from(yearSet).sort((a, b) => {
    if (a === "Unspecified") return 1;
    if (b === "Unspecified") return -1;
    return b.localeCompare(a);
  });

  const grouped: Record<string, any[]> = {};
  for (const p of sorted) {
    const key = p.year || "Unspecified";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }
  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "Unspecified") return 1;
    if (b === "Unspecified") return -1;
    return b.localeCompare(a);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {isBoard && (
        <div className="dashboard-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
            <span className="material-symbols-outlined" style={{ color: "var(--primary-green)" }}>add_circle</span>
            <h3 style={{ margin: 0 }}>Create New Project</h3>
          </div>
          <CreateProjectSection authToken={authToken} departments={departments} onCreated={load} />
        </div>
      )}

      <div style={{ 
        display: "flex", flexWrap: "wrap", alignItems: "center", 
        justifyContent: "space-between", gap: "1rem" 
      }}>
        <div style={{ display: "flex", gap: "0.5rem", background: "var(--surface-container-low)", padding: "4px", borderRadius: "12px", border: "1px solid var(--border-light)" }}>
          <button 
            className={`btn ${!showCompleted ? "" : "outline"}`} 
            style={{ border: "none", background: !showCompleted ? "var(--bg-card)" : "transparent", color: !showCompleted ? "var(--primary-green)" : "var(--text-secondary)", boxShadow: !showCompleted ? "var(--shadow-sm)" : "none", padding: "8px 16px" }}
            onClick={() => setShowCompleted(false)}
          >
            Active
          </button>
          <button 
            className={`btn ${showCompleted ? "" : "outline"}`} 
            style={{ border: "none", background: showCompleted ? "var(--bg-card)" : "transparent", color: showCompleted ? "var(--primary-green)" : "var(--text-secondary)", boxShadow: showCompleted ? "var(--shadow-sm)" : "none", padding: "8px 16px" }}
            onClick={() => setShowCompleted(true)}
          >
            Completed
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flex: 1, minWidth: 300, justifyContent: "flex-end" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
             <span className="material-symbols-outlined" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: "var(--text-tertiary)" }}>search</span>
             <input className="input" style={{ paddingLeft: "2.5rem" }} placeholder="Search projects..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <select className="input" style={{ width: "auto" }} value={sortOrder} onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
          <select className="input" style={{ width: "auto" }} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="">All Years</option>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {sorted.length === 0 && (
        <div className="dashboard-card" style={{ textAlign: "center", padding: "4rem" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--text-tertiary)", marginBottom: "1rem" }}>folder_off</span>
          <p style={{ color: "var(--text-secondary)", fontSize: "15px" }}>No {showCompleted ? "completed" : "active"} projects found matching your criteria.</p>
        </div>
      )}

      {groupKeys.map((yearKey) => (
        <div key={yearKey} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
             <h3 style={{ margin: 0, fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-tertiary)" }}>
               {yearKey === "Unspecified" ? "Archived / Unspecified" : yearKey}
             </h3>
             <div style={{ flex: 1, height: 1, background: "var(--border-light)" }} />
          </div>
          
          <div className="members-grid" style={{ gap: "1.5rem" }}>
            {grouped[yearKey].map((p: any) => {
              const userDeptAssigned = departmentId && p.departments?.some((d: any) => d.id === departmentId);
              const canAssign = (isBoard || (canManage && userDeptAssigned));
              const canManageTasks = isBoard || (canManage && userDeptAssigned);
              return (
                <div key={p.id} className="dashboard-card" style={{ gridColumn: "1 / -1", padding: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>{p.name}</h3>
                        <span style={{ 
                          fontSize: 10, fontWeight: 800, textTransform: "uppercase", padding: "2px 10px", borderRadius: 20,
                          background: p.status === "completed" ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
                          color: p.status === "completed" ? "var(--status-success)" : "var(--status-warning)",
                          border: `1px solid ${p.status === "completed" ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)"}`
                        }}>{p.status}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
                        {p.company_org && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>business</span>{p.company_org}</span>}
                        {p.year && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_today</span>{p.year}</span>}
                        {p.deadline && <span style={{ display: "flex", alignItems: "center", gap: 4, color: new Date(p.deadline) < new Date() && p.status !== "completed" ? "var(--status-error)" : "inherit" }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>alarm</span>Due: {p.deadline.slice(0, 10)}</span>}
                      </div>
                      <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {p.departments?.map((d: any) => (
                          <span key={d.id} style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: "var(--surface-container-low)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>
                            {d.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      {showCompleted && powerLevel >= 100 && (
                        <button className="btn outline" style={{ padding: "6px 12px", fontSize: 13 }} onClick={async () => {
                          const res = await fetch(apiUrl(`/api/projects/${p.id}/reopen`), { method: "POST", headers: { Authorization: `Bearer ${authToken}` } });
                          const data = await res.json();
                          if (data.success) { setProjects(projects.filter((x: any) => x.id !== p.id)); alert("Project reopened"); } else alert(data.error);
                        }}>Reopen</button>
                      )}
                      {isBoard && (
                        <button className="header-action-btn" style={{ color: "var(--status-error)" }} onClick={async () => {
                          if (!confirm(`Delete project "${p.name}"?`)) return;
                          const res = await fetch(apiUrl(`/api/projects/${p.id}`), { method: "DELETE", headers: { Authorization: `Bearer ${authToken}` } });
                          const data = await res.json();
                          if (data.success) setProjects(projects.filter((x: any) => x.id !== p.id)); else alert("Delete failed: " + (data.error || "unknown"));
                        }}>
                          <span className="material-symbols-outlined">delete</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {p.description && (
                    <div style={{ marginTop: "1.25rem", padding: "1rem", background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border-light)", color: "var(--text-primary)", fontSize: 14, lineHeight: 1.6 }}>
                      {p.description}
                    </div>
                  )}

                  <div style={{ marginTop: "1.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                       <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--text-tertiary)" }}>groups</span>
                       <strong style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>Team Members</strong>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {p.roles?.length > 0 ? p.roles.map((r: any) => (
                        <div key={r.id} style={{ padding: "6px 12px", background: "var(--bg-card)", borderRadius: 8, border: "1px solid var(--border-light)", display: "flex", alignItems: "center", gap: 8, boxShadow: "var(--shadow-sm)" }}>
                          <div className="avatar-circle" style={{ width: 24, height: 24, fontSize: 10, background: "var(--accent-bg)", color: "var(--accent)" }}>{r.user_name?.[0].toUpperCase()}</div>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{r.user_name}</span>
                          <span style={{ fontSize: 11, color: "var(--primary-green)", background: "var(--accent-bg)", padding: "2px 6px", borderRadius: 4 }}>{r.role_name}</span>
                          {canAssign && (
                            <button style={{ border: "none", background: "none", color: "var(--text-tertiary)", cursor: "pointer", display: "flex", padding: 0 }} onClick={async () => {
                              await fetch(apiUrl(`/api/projects/${p.id}/roles/${r.id}`), { method: "DELETE", headers: { Authorization: `Bearer ${authToken}` } });
                              load();
                            }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                            </button>
                          )}
                        </div>
                      )) : <span style={{ fontSize: 13, color: "var(--text-tertiary)", fontStyle: "italic" }}>No team members assigned yet.</span>}
                    </div>
                  </div>

                  {canAssign && (
                    <div style={{ marginTop: "1.5rem", padding: "1rem", borderRadius: 12, background: "var(--surface-container-low)", border: "1px dashed var(--outline-variant)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: "var(--text-secondary)" }}>ASSIGN NEW ROLE</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <select className="input" style={{ flex: 2, minWidth: 200 }} value={assignProjectId === p.id ? assignUserId : ""} onChange={(e) => { setAssignProjectId(p.id); setAssignUserId(e.target.value); }}>
                          <option value="">Select a member...</option>
                          {availableMembers.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                        </select>
                        <input className="input" style={{ flex: 1, minWidth: 150 }} placeholder="Role (e.g. Lead, Analyst)" value={assignProjectId === p.id ? assignRoleName : ""} onChange={(e) => { setAssignProjectId(p.id); setAssignRoleName(e.target.value); }} />
                        <button className="btn" style={{ gap: 8 }} disabled={assignBusy} onClick={async () => {
                          if (!assignUserId || !assignRoleName) return alert("Select member and enter role name");
                          setAssignBusy(true);
                          try {
                            const res = await fetch(apiUrl(`/api/projects/${p.id}/roles`), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ userId: assignUserId, roleName: assignRoleName }) });
                            const data = await res.json();
                            if (data.success) { setAssignUserId(""); setAssignRoleName(""); setAssignProjectId(""); load(); alert("Role assigned successfully."); } else alert(data.error);
                          } finally { setAssignBusy(false); }
                        }}>
                          <span className="material-symbols-outlined">person_add</span>
                          Assign
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border-light)", paddingTop: "1.5rem" }}>
                    <ProjectTasksSection
                      authToken={authToken}
                      projectId={p.id}
                      projectStatus={p.status}
                      canManageTasks={canManageTasks}
                      isBoard={isBoard}
                      assignees={Array.from(new Map([
                        ...availableMembers.filter((u: any) => u.power_level >= 100 || (p.departments || []).some((d: any) => d.id === u.department_id)),
                        ...(p.roles || []).map((r: any) => ({ id: r.user_id, name: r.user_name })),
                      ].map((u: any) => [u.id, { id: u.id, name: u.name }])).values())}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
