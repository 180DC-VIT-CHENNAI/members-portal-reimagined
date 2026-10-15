/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth, useClerk } from "@clerk/react";
import MembersLogin from "./MembersLogin";
import TodaySection from "./TodaySection";
import DepartmentPanel from "./DepartmentPanel";
import ProfileSection from "./ProfileSection";
import ClubFilesPanel from "./ClubFilesPanel";
import MembersSection from "./MembersSection";
import ClubMeetsSection from "./ClubMeetsSection";
import DepartmentMeetsSection from "./DepartmentMeetsSection";
import InterDeptMeetsSection from "./InterDeptMeetsSection";
import ProjectsSection from "./ProjectsSection";
import TeamInstancesSection from "./TeamInstancesSection";
import InstructionsSection from "./InstructionsSection";
import ConsultingRequestsSection from "./ConsultingRequestsSection";
import SendMailSection from "./SendMailSection";
import CaseStudySection from "./CaseStudySection";
import AdminNewsletterSection from "./NewsletterSection";
import LetterAccessSection from "./LetterAccessSection";
import TransfersSection from "./TransfersSection";
import AdminConsole from "./AdminConsole";
import AdminDataLoader from "./AdminDataLoader";
import { apiUrl } from "../../lib/api";
import { createMemberSession } from "../../lib/member-session";
import { useTheme } from "../../context/ThemeContext";
import { QUOTES } from "../../data/quotes";
import { stripHtmlTags } from "../../lib/sanitize";
import { DEPT_NAMES } from "./constants";
import "./MembersLayout.css";

function PomodoroTimer() {
  const [mode, setMode] = useState<"work" | "break">("work");
  const [time, setTime] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const WORK = 25 * 60;
  const BREAK = 5 * 60;

  const { mins, secs, circ, offset, color } = useMemo(() => {
    const total = mode === "work" ? WORK : BREAK;
    const p = ((total - time) / total) * 100;
    const c = 2 * Math.PI * 54;
    return {
      mins: Math.floor(time / 60),
      secs: time % 60,
      circ: c,
      offset: c - (p / 100) * c,
      color: mode === "work" ? "var(--primary-green)" : "var(--primary-dark-green, #75a633)",
    };
  }, [mode, time]);

  const playBeep = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
      setTimeout(() => ctx.close(), 600);
    } catch {}
  }, []);

  const start = useCallback(() => {
    if (running) return;
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setTime((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          playBeep();
          if (mode === "work") {
            setSessions((s) => s + 1);
            setMode("break");
            return BREAK;
          }
          setMode("work");
          return WORK;
        }
        return prev - 1;
      });
    }, 1000);
  }, [running, mode, playBeep]);

  const pause = useCallback(() => { clearInterval(intervalRef.current!); setRunning(false); }, []);
  const reset = useCallback(() => { clearInterval(intervalRef.current!); setRunning(false); setMode("work"); setTime(WORK); }, []);

  return (
    <div className="dashboard-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "24px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, alignSelf: "flex-start" }}>
        <span className="material-symbols-outlined" style={{ color: "var(--primary-green)", fontSize: 20 }}>timer</span>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Pomodoro Timer</h2>
      </div>

      <div style={{ position: "relative", width: 130, height: 130 }}>
        <svg width="130" height="130" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="65" cy="65" r="54" fill="none" stroke="var(--surface-container-high)" strokeWidth="8" />
          <circle cx="65" cy="65" r="54" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: 1, color }}>
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-tertiary)", marginTop: 2 }}>
            {mode === "work" ? "Focus" : "Break"}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {!running ? (
          <button onClick={start} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 10, border: "none", background: color, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "opacity 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span> Start
          </button>
        ) : (
          <button onClick={pause} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 10, border: "none", background: "var(--surface-container-high)", color: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "opacity 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>pause</span> Pause
          </button>
        )}
        <button onClick={reset} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border-light)", background: "transparent", color: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "opacity 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>restart_alt</span>
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-secondary)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--primary-green)" }}>check_circle</span>
          <span style={{ fontWeight: 600 }}>{sessions}</span> sessions
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--primary-green)" }}>local_fire_department</span>
          <span style={{ fontWeight: 600 }}>{sessions * 25}</span> min focused
        </div>
      </div>
    </div>
  );
}

function QuoteOfTheDay() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));

  const refresh = useCallback(() => {
    let next = Math.floor(Math.random() * QUOTES.length);
    if (next === idx && QUOTES.length > 1) next = (next + 1) % QUOTES.length;
    setIdx(next);
  }, [idx]);

  const q = QUOTES[idx];

  return (
    <div className="members-grid" style={{ marginTop: "1.5rem" }}>
      <div className="dashboard-card" style={{ gridColumn: "1 / -1", padding: "28px 32px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -10, fontSize: 120, fontWeight: 900, color: "var(--primary-green)", opacity: 0.04, lineHeight: 1, pointerEvents: "none" }}>"</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="material-symbols-outlined" style={{ color: "var(--primary-green)", fontSize: 20 }}>format_quote</span>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Quote of the Day</h2>
          </div>
          <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border-light)", background: "transparent", color: "var(--text-secondary)", fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary-green)"; e.currentTarget.style.color = "var(--primary-green)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-light)"; e.currentTarget.style.color = "var(--text-secondary)"; }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
            New Quote
          </button>
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65, fontWeight: 500, fontStyle: "italic", color: "var(--text-primary)", maxWidth: "85%" }}>
            &ldquo;{q.text}&rdquo;
          </p>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--primary-green)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>
              {q.author.charAt(0)}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>&mdash; {q.author}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MembersLayout() {
  const { isDark, toggle: toggleTheme } = useTheme();
  const { userId: clerkUserId, getToken, isLoaded: clerkLoaded } = useAuth();
  const clerk = useClerk();
  const [authToken, setAuthToken] = useState<string | null>(() => sessionStorage.getItem("authToken"));
  const [email, setEmail] = useState<string | null>(sessionStorage.getItem("authEmail"));
  const [powerLevel, setPowerLevel] = useState<number>(() => {
    const stored = sessionStorage.getItem("authPowerLevel");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [departmentId, setDepartmentId] = useState<string | null>(sessionStorage.getItem("authDepartmentId"));
  const [roleId, setRoleId] = useState<string | null>(sessionStorage.getItem("authRoleId"));
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    const stored = localStorage.getItem("membersSidebarCollapsed");
    return stored === "true";
  });
  const [activePanel, setActivePanel] = useState("dashboard");
  const [activeDeptId, setActiveDeptId] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [adminTokens, setAdminTokens] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [stats, setStats] = useState({ membersCount: 0, projectsCount: 0, upcomingMeetsCount: 0, announcementsCount: 0, todayEmailCount: 0, hourEmailCount: 0, hourEmailLimit: 500 });
  const [recentMeets, setRecentMeets] = useState<any[]>([]);

  const [tokenEmail, setTokenEmail] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenRoleId, setTokenRoleId] = useState("member");
  const [tokenBusy, setTokenBusy] = useState(false);
  const [boardEmail, setBoardEmail] = useState("");
  const [boardName, setBoardName] = useState("");
  const [boardRoleId, setBoardRoleId] = useState("chairperson");
  const [boardDepartmentId, setBoardDepartmentId] = useState("");
  const [boardBusy, setBoardBusy] = useState(false);
  const [recentToken, setRecentToken] = useState<string | null>(null);
  const [showRecentToken, setShowRecentToken] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberDepartmentId, setMemberDepartmentId] = useState("");
  const [memberBusy, setMemberBusy] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [annTitle, setAnnTitle] = useState("");
  const [annContent, setAnnContent] = useState("");
  const [annBusy, setAnnBusy] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [roleTransfers, setRoleTransfers] = useState<any[]>([]);

  const [transferFromUserId, setTransferFromUserId] = useState("");
  const [transferToUserId, setTransferToUserId] = useState("");
  const [transferRoleId, setTransferRoleId] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);

  const [dangerUserId, setDangerUserId] = useState("");
  const [dangerNewRoleId, setDangerNewRoleId] = useState("");
  const [dangerNewDeptId, setDangerNewDeptId] = useState("");
  const [dangerBusy, setDangerBusy] = useState(false);

  const [deleteUserId, setDeleteUserId] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Advisory member creation state
  const [advisoryEmail, setAdvisoryEmail] = useState("");
  const [advisoryName, setAdvisoryName] = useState("");
  const [advisoryExTitle, setAdvisoryExTitle] = useState("");
  const [advisoryMemberDeptId, setAdvisoryMemberDeptId] = useState("");
  const [advisoryBusy, setAdvisoryBusy] = useState(false);
  const [advisoryRecentToken, setAdvisoryRecentToken] = useState<string | null>(null);

  // Danger Zone advisory change state
  const [dangerAdvUserId, setDangerAdvUserId] = useState("");
  const [dangerAdvExTitle, setDangerAdvExTitle] = useState("");
  const [dangerAdvBusy, setDangerAdvBusy] = useState(false);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["General", "Departments", "Management", "Admin"]));
  const [mobileSheetSection, setMobileSheetSection] = useState<string | null>(null);
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthStatusMsg, setOauthStatusMsg] = useState<string | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState<{ enabled: boolean; message: string } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Auto-logout after 7 days of inactivity
  useEffect(() => {
    const expiresAt = localStorage.getItem("authExpiresAt");
    if (expiresAt && Date.now() > Number(expiresAt)) {
      clearMemberSession();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClickOutsideNotif = useCallback((e: MouseEvent) => {
    if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
      setShowNotifications(false);
    }
  }, []);

  useEffect(() => {
    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutsideNotif);
    } else {
      document.removeEventListener("mousedown", handleClickOutsideNotif);
    }
    return () => document.removeEventListener("mousedown", handleClickOutsideNotif);
  }, [showNotifications, handleClickOutsideNotif]);

  function toggleSection(label: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  useEffect(() => {
    fetch(apiUrl("/api/admin/maintenance"))
      .then(r => r.json())
      .then(d => setMaintenanceMode({ enabled: !!d.enabled, message: d.message || "" }))
      .catch(() => setMaintenanceMode({ enabled: false, message: "" }));
  }, []);

  const handleLogin = (
    token: string,
    userEmail: string,
    serverPowerLevel?: number,
    serverDepartmentId?: string,
    serverRoleId?: string,
    expiresAt?: string,
  ) => {
    setDashboardReady(false);
    sessionStorage.removeItem("loggedOut");
    localStorage.setItem("authExpiresAt", String(expiresAt ? Date.parse(expiresAt) : Date.now() + 7 * 24 * 60 * 60 * 1000));
    sessionStorage.setItem("authToken", token);
    sessionStorage.setItem("authEmail", userEmail);
    sessionStorage.setItem("authPowerLevel", String(serverPowerLevel ?? 10));
    if (serverDepartmentId) sessionStorage.setItem("authDepartmentId", serverDepartmentId);
    else sessionStorage.removeItem("authDepartmentId");
    if (serverRoleId) sessionStorage.setItem("authRoleId", serverRoleId);
    setAuthToken(token);
    setEmail(userEmail);
    setPowerLevel(serverPowerLevel ?? 10);
    setDepartmentId(serverDepartmentId || null);
    if (serverRoleId) setRoleId(serverRoleId);
  };

  function clearMemberSession() {
    sessionStorage.clear();
    sessionStorage.setItem("loggedOut", "true");
    localStorage.removeItem("authExpiresAt");
    setAuthToken(null);
    setEmail(null);
    setPowerLevel(0);
    setRoleId(null);
    setDepartmentId(null);
    setActiveDeptId(null);
    setRecentToken(null);
    setShowRecentToken(false);
    setTokenEmail("");
    setTokenName("");
    setBoardEmail("");
    setBoardName("");
    setMemberEmail("");
    setMemberName("");
    setAnnTitle("");
    setAnnContent("");
    setPendingRequests([]);
    setAdminTokens([]);
    setRoleTransfers([]);
    setAllUsers([]);
    setAllRoles([]);
    setAnnouncements([]);
    setRecentMeets([]);
    setDashboardReady(false);
    setActivePanel("dashboard");
    clerk.signOut().catch(() => {});
  }

  useEffect(() => {
    const controller = new AbortController();
    async function loadDashboard() {
      if (!authToken) return;
      try {
        const res = await fetch(apiUrl("/api/dashboard"), {
          headers: { Authorization: `Bearer ${authToken}` },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res.status === 401) {
          clearMemberSession();
          return;
        }
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (data.success) {
          setEmail(data.user?.email || email);
          setDepartmentId(data.user?.departmentId || null);
          if (data.user?.departmentId) sessionStorage.setItem("authDepartmentId", data.user.departmentId);
          else sessionStorage.removeItem("authDepartmentId");
          if (data.user?.powerLevel != null) {
            setPowerLevel(data.user.powerLevel);
            sessionStorage.setItem("authPowerLevel", String(data.user.powerLevel));
          }
          if (data.user?.roleId) {
            setRoleId(data.user.roleId);
            sessionStorage.setItem("authRoleId", data.user.roleId);
          }
          if (data.stats) setStats(data.stats);
          if (data.recentMeets) setRecentMeets(data.recentMeets);
          setOauthEnabled(data.user?.oauthEnabled ?? false);
          setPendingRequests(data.pendingRequests || []);
          setAdminTokens(data.adminTokens || []);
          setAnnouncements(data.announcements || []);
          setRoleTransfers(data.roleTransfers || []);
          if (data.departments) setDepartments(data.departments);
          setDashboardReady(true);
        } else {
          setDashboardReady(true);
        }
      } catch {
        if (!controller.signal.aborted) setDashboardReady(true);
      }
    }
    loadDashboard();
    const refreshOnVisible = () => { if (document.visibilityState === "visible") loadDashboard(); };
    const timer = setInterval(refreshOnVisible, 60_000);
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [authToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clerk callback handler — runs after OAuth redirect
  const linkingFlag = useRef(false);
  useEffect(() => {
    if (!clerkLoaded) return;
    if (!clerkUserId) return;

    const pending = sessionStorage.getItem("clnk");

    async function handleClerkCallback() {

      if (sessionStorage.getItem("loggedOut") && !authToken) {
        sessionStorage.removeItem("loggedOut");
      }

      // Login flow: Clerk session exists but no token session
      if (!authToken) {
        setOauthLoading(true);
        try {
          // Retry getToken() a few times — Clerk may not have the JWT ready after OAuth redirect
          let clerkJwt: string | null = null;
          for (let attempt = 0; attempt < 5; attempt++) {
            clerkJwt = await getToken();
            if (clerkJwt) break;
            await new Promise(r => setTimeout(r, 500));
          }
          if (!clerkJwt) {
            setOauthLoading(false);
            setOauthStatusMsg("Google sign-in is taking longer than expected. Try again.");
            return;
          }
          const res = await fetch(apiUrl("/api/auth/clerk-login"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clerkToken: clerkJwt }),
          });
          const data = await res.json();
          setOauthLoading(false);
          if (data.success) {
            const session = await createMemberSession(data.token);
            handleLogin(session.token, session.email, session.powerLevel, session.departmentId, session.roleId, session.expiresAt);
            setOauthStatusMsg(null);
          } else {
            setOauthStatusMsg(data.error || "Google login failed");
          }
          return;
        } catch (err) {
          console.error("[clerk-cb] login flow exception:", err);
          setOauthLoading(false);
          setOauthStatusMsg("Google login failed. Try again.");
          return;
        }
      }

      // Linking flow: Clerk session + existing token + linking flag
      if (authToken && pending === "link" && !linkingFlag.current) {
        linkingFlag.current = true;
        sessionStorage.removeItem("clnk");
        try {
          const clerkToken = await getToken();
          if (!clerkToken) throw new Error("Google session is not ready");
          const res = await fetch(apiUrl("/api/auth/link-clerk"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ clerkToken }),
          });
          const data = await res.json();
          if (data.success) {
            setOauthEnabled(true);
            setOauthStatusMsg("Google login enabled! You can now sign in with Google.");
            setTimeout(() => setOauthStatusMsg(null), 5000);
          } else {
            setOauthStatusMsg(data.error || "Failed to link Google account");
          }
        } catch (err) {
          console.error("[clerk-cb] link-clerk exception:", err);
          setOauthStatusMsg("Failed to link Google account. Try again.");
        }
      }
    }

    handleClerkCallback();
  }, [clerkUserId, clerkLoaded, authToken, getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasDepartment = departmentId && DEPT_NAMES[departmentId];
  const deptName = hasDepartment ? DEPT_NAMES[departmentId!] : "";

  type NavItem = { id: string; label: string; minPower: number; deptId?: string; icon: string };
  type NavSection = { label: string; items: NavItem[] };

  // Directors (power 50) see only their own department's panel
  const allowedDeptIds = hasDepartment && powerLevel >= 50 ? [departmentId!] : [];

  const navSections: NavSection[] = [];

  if (roleId === "advisory") {
    navSections.push({
      label: "",
      items: [
        { id: "dashboard", label: "Dashboard", minPower: 0, icon: "dashboard" },
        { id: "profile", label: "Profile", minPower: 0, icon: "person" },
      ],
    });
  } else {
    // General
    navSections.push({
      label: "General",
      items: [
        { id: "dashboard", label: "Dashboard", minPower: 0, icon: "dashboard" },
        { id: "members", label: "Members", minPower: 0, icon: "groups" },
        { id: "profile", label: "Profile", minPower: 0, icon: "person" },
        { id: "club-files", label: "Club Files", minPower: 10, icon: "folder_open" },
      ],
    });

    // Departments (management panels)
    const deptItems: NavItem[] = [];
    if (powerLevel >= 100) {
      departments.forEach((d: any) => {
        deptItems.push({ id: `dept-${d.id}`, label: d.name, minPower: 0, deptId: d.id, icon: "domain" });
      });
    } else if (allowedDeptIds.length > 0) {
      departments
        .filter((d: any) => allowedDeptIds.includes(d.id))
        .forEach((d: any) => {
          deptItems.push({ id: `dept-${d.id}`, label: d.name, minPower: 0, deptId: d.id, icon: "domain" });
        });
    }
    if (deptItems.length > 0) {
      navSections.push({ label: "Departments", items: deptItems });
    }

    // Management
    const managementItems: NavItem[] = [
      { id: "meets", label: "Meets", minPower: 0, icon: "event" },
      { id: "projects", label: "Projects", minPower: 0, icon: "account_tree" },
      { id: "team-instances", label: "Teams", minPower: 0, icon: "diversity_3" },
      { id: "instructions", label: "Instructions", minPower: 0, icon: "menu_book" },
      { id: "transfers", label: "Transfers", minPower: 0, icon: "swap_horiz" },
      { id: "announcements", label: "Announcements", minPower: 0, icon: "campaign" },
      { id: "case-studies", label: "Case Studies", minPower: 0, icon: "description" },
    ];
    navSections.push({ label: "Management", items: managementItems });

    // Admin
    navSections.push({
      label: "Admin",
      items: [
        { id: "consulting", label: "Consulting", minPower: 100, icon: "business_center" },
        { id: "sendmail", label: "Send Mail", minPower: 50, icon: "alternate_email" },
        { id: "newsletter", label: "Newsletter", minPower: 100, icon: "mail" },
        { id: "letters", label: "Letter Studio", minPower: 100, icon: "description" },
        { id: "admin", label: "Admin Console", minPower: 100, icon: "terminal" },
      ],
    });
  }

  if (!authToken) return <MembersLogin onLogin={handleLogin} oauthLoading={oauthLoading} oauthError={oauthStatusMsg} />;

  if (maintenanceMode?.enabled && powerLevel < 100) {
    return (
      <div style={{ backgroundColor: "var(--bg-primary)", minHeight: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="card-doodle" style={{ maxWidth: 480, textAlign: "center", padding: 40 }}>
          <h2 style={{ margin: "0 0 12px" }}>Under Maintenance</h2>
          <p style={{ color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
            {maintenanceMode.message || "The members portal is currently under maintenance. Please check back later."}
          </p>
          <button className="btn" style={{ marginTop: 24 }} onClick={() => { sessionStorage.clear(); setAuthToken(null); }}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!dashboardReady) {
    return (
      <div style={{ backgroundColor: "var(--bg-primary)", minHeight: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="card-doodle">Loading dashboard...</div>
      </div>
    );
  }

  const activeLabel = (() => {
    for (const section of navSections) {
      const item = section.items.find(i => i.id === activePanel || (i.deptId && activePanel === "department" && activeDeptId === i.deptId));
      if (item) return item.label;
    }
    return activePanel.charAt(0).toUpperCase() + activePanel.slice(1);
  })();

  return (
    <div className="members-layout">
      {/* Loads users/roles once per session so member dropdowns are instant */}
      {powerLevel >= 50 && (
        <AdminDataLoader authToken={authToken!} setAllUsers={setAllUsers} setAllRoles={setAllRoles} />
      )}
      {/* HEADER */}
      <header className="members-header">
        <div className="header-left">
          <a href="#" className="header-logo" onClick={(e) => { e.preventDefault(); setActivePanel("dashboard"); }}>
            <img src="/images/official-logo.png" alt="180 Degrees Consulting logo" />
            <span className="header-logo-word">180DC <em>Portal</em></span>
          </a>
          <div className="search-container">
            <span className="material-symbols-outlined search-icon">search</span>
            <input type="text" className="search-input" placeholder="Search..." />
          </div>
        </div>
        <div className="header-right">
          <div ref={notifRef} style={{ position: "relative" }}>
            <button className="header-action-btn" onClick={() => setShowNotifications(v => !v)}>
              <span className="material-symbols-outlined">notifications</span>
              {announcements.length > 0 && (
                <span style={{ position: "absolute", top: 2, right: 2, width: 8, height: 8, borderRadius: "50%", background: "var(--status-error)" }} />
              )}
            </button>
            {showNotifications && (
              <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 1000, width: 320, background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: 12, boxShadow: "var(--shadow-lg)", padding: "0.75rem", marginTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", padding: "0.25rem 0.5rem 0.5rem", borderBottom: "1px solid var(--border-light)", marginBottom: 4 }}>Notifications</div>
                {announcements.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "1rem 0.5rem", margin: 0, textAlign: "center" }}>No notifications</p>
                ) : (
                  announcements.slice(0, 2).map((a: any) => (
                    <div key={a.id} style={{ padding: "0.5rem", borderRadius: 8, cursor: "pointer" }} onClick={() => { setShowNotifications(false); setActivePanel("announcements"); }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{stripHtmlTags(a.title)}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stripHtmlTags(a.content)}</div>
                    </div>
                  ))
                )}
                {announcements.length > 2 && (
                  <div style={{ padding: "0.5rem", textAlign: "center", borderTop: "1px solid var(--border-light)", marginTop: 4 }}>
                    <button className="btn outline" style={{ padding: "4px 12px", fontSize: 11, width: "100%", justifyContent: "center" }} onClick={() => { setShowNotifications(false); setActivePanel("announcements"); }}>View All</button>
                  </div>
                )}
              </div>
            )}
          </div>
          <button className="header-action-btn" onClick={toggleTheme}>
            <span className="material-symbols-outlined">{isDark ? "light_mode" : "dark_mode"}</span>
          </button>
          <button className="header-action-btn" onClick={() => setShowLogoutConfirm(true)} title="Logout" style={{ color: "var(--status-error)" }}>
            <span className="material-symbols-outlined">logout</span>
          </button>
          <div className="user-profile-trigger" onClick={() => setActivePanel("profile")}>
            <div className="avatar-circle">
              {email?.[0].toUpperCase()}
            </div>
            <div className="user-info-brief">
              <span className="user-name">{email?.split("@")[0]}</span>
              <span className="user-power">Power {powerLevel}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="layout-wrapper">
        {/* SIDEBAR */}
        <aside className={`members-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <nav className="sidebar-nav">
            {navSections.map((section) => {
              const visible = section.items.filter((n) => powerLevel >= n.minPower);
              if (visible.length === 0) return null;
              const isActive = (item: any) => item.deptId ? (activePanel === "department" && activeDeptId === item.deptId) : activePanel === item.id;
              return (
                <div key={section.label}>
                  {section.label && !sidebarCollapsed && (
                    <div className="nav-section-label" onClick={() => toggleSection(section.label)}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        {expandedSections.has(section.label) ? "keyboard_arrow_down" : "keyboard_arrow_right"}
                      </span>
                      {section.label}
                    </div>
                  )}
                  {(!section.label || (!sidebarCollapsed && expandedSections.has(section.label)) || sidebarCollapsed) ? visible.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.deptId) { setActiveDeptId(item.deptId); setActivePanel("department"); }
                        else setActivePanel(item.id);
                      }}
                      className={`nav-item ${isActive(item) ? "active" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <span className="material-symbols-outlined">{item.icon}</span>
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </button>
                  )) : null}
                </div>
              );
            })}
          </nav>
          <div className="sidebar-footer">
            <button className="nav-item" onClick={() => {
              const next = !sidebarCollapsed;
              setSidebarCollapsed(next);
              localStorage.setItem("membersSidebarCollapsed", String(next));
            }}>
              <span className="material-symbols-outlined">{sidebarCollapsed ? "side_navigation" : "menu_open"}</span>
              {!sidebarCollapsed && <span>{sidebarCollapsed ? "Expand" : "Collapse"} Sidebar</span>}
            </button>
            <button className="nav-item" onClick={() => setShowLogoutConfirm(true)} style={{ color: "var(--status-error)" }}>
              <span className="material-symbols-outlined">logout</span>
              {!sidebarCollapsed && <span>Logout</span>}
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className={`members-main ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
          <div style={{ marginBottom: "1.5rem" }}>
             <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>{activeLabel}</h1>
             {activePanel === "dashboard" && <p style={{ color: "var(--text-secondary)", margin: "4px 0 0", fontSize: "14px" }}>Welcome back, here's what's happening.</p>}
          </div>

          {activePanel === "dashboard" && (
            <>
              <div className="dashboard-grid">
                <TodaySection authToken={authToken!} onOpen={setActivePanel} />
                {[
                  { icon: "account_tree", label: "Active Projects", value: stats.projectsCount, bg: "rgba(141, 198, 63, 0.15)", color: "var(--primary-green)" },
                  { icon: "groups", label: "Total Members", value: stats.membersCount, bg: "rgba(59, 130, 246, 0.15)", color: "var(--info, #3b82f6)" },
                  { icon: "event_available", label: "Upcoming Meets", value: stats.upcomingMeetsCount, bg: "rgba(245, 158, 11, 0.15)", color: "var(--status-warning)" },
                  { icon: "campaign", label: "Announcements", value: stats.announcementsCount, bg: "rgba(139, 92, 246, 0.15)", color: "var(--purple, #8b5cf6)" },
                ].map((kpi) => (
                  <div key={kpi.label} className="kpi-card">
                    <div className="kpi-header">
                      <div className="kpi-icon-wrapper" style={{ background: kpi.bg, color: kpi.color }}>
                        <span className="material-symbols-outlined">{kpi.icon}</span>
                      </div>
                    </div>
                    <span className="kpi-label">{kpi.label}</span>
                    <span className="kpi-value">{kpi.value}</span>
                  </div>
                ))}
              </div>

              <div className="members-grid" style={{ marginTop: "1.5rem" }}>
                <PomodoroTimer />

                <div className="dashboard-card" style={{ padding: "20px 22px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--primary-green)", fontSize: 20 }}>link</span>
                    <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Quick Links</h2>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { label: "Main Website", url: "https://180dcvitc.org", icon: "language", color: "var(--primary-green)" },
                      { label: "Recruitments", url: "https://vitc-180dc.org", icon: "group_add", color: "#8b5cf6" },
                      { label: "Newsletter Subscription", url: "https://180dcvitc.org/subscriber", icon: "mail", color: "#f59e0b" },
                      { label: "Newsletter Management", url: "https://180dcvitc.org/subscriber/newsletter", icon: "edit_note", color: "#3b82f6" },
                      { label: "Letter Studio", url: "https://180dcvitc.org/letters", icon: "description", color: "#0b7a53" },
                    ].map((link) => (
                      <a
                        key={link.label}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 14px",
                          borderRadius: 10,
                          background: "var(--surface-container-high)",
                          textDecoration: "none",
                          color: "inherit",
                          transition: "all 0.2s ease",
                          border: "1px solid transparent",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.border = `1px solid ${link.color}40`;
                          e.currentTarget.style.background = "var(--surface-container-highest, var(--surface-container-high))";
                          e.currentTarget.style.transform = "translateX(4px)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.border = "1px solid transparent";
                          e.currentTarget.style.background = "var(--surface-container-high)";
                          e.currentTarget.style.transform = "translateX(0)";
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: link.color }}>{link.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{link.label}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--text-tertiary)", marginLeft: "auto" }}>open_in_new</span>
                      </a>
                    ))}
                  </div>

                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--surface-container-high)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#ec4899" }}>sports_esports</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Games</span>
                    </div>
                    <a
                      href="https://slingshot-expo.vercel.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 14px",
                        borderRadius: 10,
                        background: "linear-gradient(135deg, #ec489915, #8b5cf615)",
                        textDecoration: "none",
                        color: "inherit",
                        transition: "all 0.2s ease",
                        border: "1px solid #ec489930",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "linear-gradient(135deg, #ec489925, #8b5cf625)";
                        e.currentTarget.style.transform = "translateX(4px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "linear-gradient(135deg, #ec489915, #8b5cf615)";
                        e.currentTarget.style.transform = "translateX(0)";
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#ec4899" }}>rocket_launch</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>Slingshot</span>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--text-tertiary)", marginLeft: "auto" }}>open_in_new</span>
                    </a>
                  </div>
                </div>

                <div className="dashboard-card" style={{ gridColumn: "1 / -1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                       <span className="material-symbols-outlined" style={{ color: "var(--primary-green)" }}>event_list</span>
                        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 500 }}>Upcoming Schedule</h2>
                    </div>
                    <button className="btn outline" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setActivePanel("meets")}>Calendar View</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
                    {recentMeets.length === 0 ? (
                      <p style={{ gridColumn: "1 / -1", fontSize: 13, color: "var(--text-tertiary)", fontStyle: "italic", textAlign: "center", padding: "1rem" }}>No upcoming sessions scheduled.</p>
                    ) : (
                      recentMeets.map((m: any, i) => (
                        <div key={i} style={{ padding: "1rem", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border-light)", display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--bg-card)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--primary-green)" }}>videocam</span>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{new Date(m.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <QuoteOfTheDay />

              {/* Recent Announcements */}
              <div className="members-grid" style={{ marginTop: "1.5rem" }}>
                <div className="dashboard-card" style={{ gridColumn: "1 / -1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="material-symbols-outlined" style={{ color: "var(--primary-green)" }}>campaign</span>
                       <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 500 }}>Recent Announcements</h2>
                    </div>
                    <button className="btn outline" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setActivePanel("announcements")}>View All</button>
                  </div>
                  {announcements.slice(0, 3).length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--text-tertiary)", fontStyle: "italic", padding: "0.5rem 0" }}>No announcements yet.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {announcements.slice(0, 3).map((a: any) => (
                        <div key={a.id} style={{ padding: "0.875rem 1rem", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }} onClick={() => setActivePanel("announcements")}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stripHtmlTags(a.title)}</div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stripHtmlTags(a.content)}</div>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap", marginLeft: 12 }}>{a.created_at?.slice(0, 10)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Profile Quick Access */}
              <div className="members-grid" style={{ marginTop: "1.5rem" }}>
                <div className="dashboard-card" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="avatar-circle" style={{ width: 44, height: 44, fontSize: 18 }}>
                      {email?.[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{email?.split("@")[0]}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{email} · Power {powerLevel}{deptName ? ` · ${deptName}` : ""}</div>
                    </div>
                  </div>
                  <button className="btn outline" style={{ padding: "8px 16px", fontSize: 13 }} onClick={() => setActivePanel("profile")}>
                    View Profile
                  </button>
                </div>
              </div>
            </>
          )}

          {activePanel === "members" && (
            <MembersSection authToken={authToken!} powerLevel={powerLevel} />
          )}

          {activePanel === "profile" && (
            <ProfileSection
              authToken={authToken!}
              email={email || ""}
              powerLevel={powerLevel}
              departmentId={departmentId}
              deptName={deptName}
              oauthEnabled={oauthEnabled}
              statusMsg={oauthStatusMsg}
              onOAuthStatusChange={setOauthStatusMsg}
              onCredentialChange={(token, expiresAt) => handleLogin(token, email || "", powerLevel, departmentId || undefined, roleId || undefined, expiresAt)}
              onSignedOut={clearMemberSession}
            />
          )}

          {activePanel === "club-files" && (
            <ClubFilesPanel authToken={authToken!} powerLevel={powerLevel} />
          )}

          {activePanel === "department" && (() => {
            const deptId = activeDeptId || departmentId;
            const deptName = deptId ? (DEPT_NAMES[deptId] || departments.find((d: any) => d.id === deptId)?.name || deptId) : "";
            if (!deptId) return null;
            return <DepartmentPanel authToken={authToken!} departmentId={deptId} departmentName={deptName} />;
          })()}

          {activePanel === "meets" && (
            <>
              <div className="members-grid">
                <div className="dashboard-card" style={{ gridColumn: "1 / -1" }}>
                  <h2>Club-Wide Meets</h2>
                  <ClubMeetsSection authToken={authToken!} powerLevel={powerLevel} />
                </div>
                <div className="dashboard-card" style={{ gridColumn: "1 / -1" }}>
                  <h2>Inter-Department Meets</h2>
                  <InterDeptMeetsSection authToken={authToken!} departments={departments} powerLevel={powerLevel} />
                </div>
                <div className="dashboard-card" style={{ gridColumn: "1 / -1" }}>
                  <h2>Department Meets</h2>
                  <DepartmentMeetsSection
                    authToken={authToken!}
                    departments={departments}
                    powerLevel={powerLevel}
                    departmentId={departmentId}
                  />
                </div>
              </div>
            </>
          )}

          {activePanel === "projects" && (
            <ProjectsSection
              authToken={authToken!}
              departments={departments}
              allUsers={allUsers}
              powerLevel={powerLevel}
              departmentId={departmentId}
            />
          )}

          {activePanel === "team-instances" && (
            <TeamInstancesSection
              authToken={authToken!}
              departments={departments}
              allUsers={allUsers}
              powerLevel={powerLevel}
              departmentId={departmentId}
            />
          )}

          {activePanel === "instructions" && (
            <div className="members-grid">
              <div className="dashboard-card" style={{ gridColumn: "1 / -1" }}>
                {!departmentId ? (
                  <p style={{ color: "var(--text-secondary)" }}>You are not assigned to any department.</p>
                ) : (
                  <InstructionsSection authToken={authToken!} departmentId={departmentId!} />
                )}
              </div>
            </div>
          )}

          {activePanel === "transfers" && (
            <div className="members-grid">
              <div className="dashboard-card" style={{ gridColumn: "1 / -1" }}>
                <TransfersSection authToken={authToken!} />
              </div>
            </div>
          )}

          {activePanel === "case-studies" && (
            <CaseStudySection authToken={authToken!} powerLevel={powerLevel} />
          )}

          {activePanel === "consulting" && powerLevel >= 100 && (
            <ConsultingRequestsSection authToken={authToken!} />
          )}

          {activePanel === "sendmail" && powerLevel >= 50 && (
            <SendMailSection authToken={authToken!} powerLevel={powerLevel} onEmailSent={async () => {
              const res = await fetch(apiUrl("/api/dashboard"), { headers: { Authorization: `Bearer ${authToken}` } });
              const data = await res.json();
              if (data.stats) setStats(data.stats);
            }} />
          )}

          {activePanel === "newsletter" && powerLevel >= 100 && (
            <AdminNewsletterSection authToken={authToken!} />
          )}

          {activePanel === "letters" && powerLevel >= 100 && (
            <LetterAccessSection authToken={authToken!} />
          )}

          {activePanel === "announcements" && (
            <div className="members-grid">
              {powerLevel >= 100 && (
                <div className="dashboard-card" style={{ gridColumn: "1 / -1" }}>
                  <h2>Post Announcement</h2>
                  <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                    <input className="input" placeholder="Title" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} />
                    <textarea className="input" placeholder="Content" rows={4} value={annContent} onChange={(e) => setAnnContent(e.target.value)} />
                    <button className="btn" disabled={annBusy} onClick={async () => {
                      if (!annTitle.trim() || !annContent.trim()) return alert("Title and content required");
                      setAnnBusy(true);
                      try {
                        const res = await fetch(apiUrl("/api/announcements"), {
                          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
                          body: JSON.stringify({ title: annTitle.trim(), content: annContent.trim() }),
                        });
                        const data = await res.json();
                        if (data.success) {
                          setAnnTitle(""); setAnnContent("");
                          const r2 = await fetch(apiUrl("/api/announcements"), { headers: { Authorization: `Bearer ${authToken}` } });
                          const d2 = await r2.json();
                          if (d2.success) setAnnouncements(d2.data || []);
                        } else alert(data.error);
                      } finally { setAnnBusy(false); }
                    }}>{annBusy ? "Posting..." : "Post Announcement"}</button>
                  </div>
                </div>
              )}

              {announcements.length === 0 && (
                <div className="dashboard-card" style={{ gridColumn: "1 / -1" }}>
                  <p style={{ color: "var(--text-secondary)" }}>No announcements yet.</p>
                </div>
              )}

              {announcements.map((a: any) => (
                <div key={a.id} className="dashboard-card" style={{ gridColumn: "1 / -1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <h2 style={{ margin: 0 }}>{stripHtmlTags(a.title)}</h2>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>{a.created_at?.slice(0, 10)}</div>
                      <div style={{ marginTop: 12, whiteSpace: "pre-wrap", color: "var(--text-secondary)", fontSize: 14 }}>{stripHtmlTags(a.content)}</div>
                    </div>
                    {powerLevel >= 100 && (
                      <button className="header-action-btn" style={{ color: "var(--status-error)" }} onClick={async () => {
                        if (!confirm("Delete this announcement?")) return;
                        await fetch(apiUrl(`/api/announcements/${a.id}`), { method: "DELETE", headers: { Authorization: `Bearer ${authToken}` } });
                        setAnnouncements(announcements.filter((x: any) => x.id !== a.id));
                      }}>
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activePanel === "admin" && powerLevel >= 100 && (
            <AdminConsole
              authToken={authToken!}
              setAllUsers={setAllUsers}
              setAllRoles={setAllRoles}
              allUsers={allUsers}
              allRoles={allRoles}
              departments={departments}
              roleTransfers={roleTransfers}
              pendingRequests={pendingRequests}
              setPendingRequests={setPendingRequests}
              adminTokens={adminTokens}
              setAdminTokens={setAdminTokens}
              tokenEmail={tokenEmail}
              setTokenEmail={setTokenEmail}
              tokenName={tokenName}
              setTokenName={setTokenName}
              tokenRoleId={tokenRoleId}
              setTokenRoleId={setTokenRoleId}
              tokenBusy={tokenBusy}
              setTokenBusy={setTokenBusy}
              recentToken={recentToken}
              setRecentToken={setRecentToken}
              showRecentToken={showRecentToken}
              setShowRecentToken={setShowRecentToken}
              boardEmail={boardEmail}
              setBoardEmail={setBoardEmail}
              boardName={boardName}
              setBoardName={setBoardName}
              boardRoleId={boardRoleId}
              setBoardRoleId={setBoardRoleId}
              boardDepartmentId={boardDepartmentId}
              setBoardDepartmentId={setBoardDepartmentId}
              boardBusy={boardBusy}
              setBoardBusy={setBoardBusy}
              advisoryEmail={advisoryEmail}
              setAdvisoryEmail={setAdvisoryEmail}
              advisoryName={advisoryName}
              setAdvisoryName={setAdvisoryName}
              advisoryExTitle={advisoryExTitle}
              setAdvisoryExTitle={setAdvisoryExTitle}
              advisoryMemberDeptId={advisoryMemberDeptId}
              setAdvisoryMemberDeptId={setAdvisoryMemberDeptId}
              advisoryBusy={advisoryBusy}
              setAdvisoryBusy={setAdvisoryBusy}
              advisoryRecentToken={advisoryRecentToken}
              setAdvisoryRecentToken={setAdvisoryRecentToken}
              memberEmail={memberEmail}
              setMemberEmail={setMemberEmail}
              memberName={memberName}
              setMemberName={setMemberName}
              memberDepartmentId={memberDepartmentId}
              setMemberDepartmentId={setMemberDepartmentId}
              memberBusy={memberBusy}
              setMemberBusy={setMemberBusy}
              transferFromUserId={transferFromUserId}
              setTransferFromUserId={setTransferFromUserId}
              transferToUserId={transferToUserId}
              setTransferToUserId={setTransferToUserId}
              transferRoleId={transferRoleId}
              setTransferRoleId={setTransferRoleId}
              transferBusy={transferBusy}
              setTransferBusy={setTransferBusy}
              dangerUserId={dangerUserId}
              setDangerUserId={setDangerUserId}
              dangerNewRoleId={dangerNewRoleId}
              setDangerNewRoleId={setDangerNewRoleId}
              dangerNewDeptId={dangerNewDeptId}
              setDangerNewDeptId={setDangerNewDeptId}
              dangerBusy={dangerBusy}
              setDangerBusy={setDangerBusy}
              dangerAdvUserId={dangerAdvUserId}
              setDangerAdvUserId={setDangerAdvUserId}
              dangerAdvExTitle={dangerAdvExTitle}
              setDangerAdvExTitle={setDangerAdvExTitle}
              dangerAdvBusy={dangerAdvBusy}
              setDangerAdvBusy={setDangerAdvBusy}
              deleteUserId={deleteUserId}
              setDeleteUserId={setDeleteUserId}
              deleteBusy={deleteBusy}
              setDeleteBusy={setDeleteBusy}
              maintenanceMode={maintenanceMode}
              setMaintenanceMode={setMaintenanceMode}
              stats={stats}
            />
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <nav className="mobile-bottom-nav">
        {navSections.map((section) => {
          const visible = section.items.filter((n) => powerLevel >= n.minPower);
          if (visible.length === 0) return null;
          const sectionActive = visible.some((n) =>
            n.deptId ? (activePanel === "department" && activeDeptId === n.deptId) : activePanel === n.id
          );
          return (
            <button
              key={section.label}
              className={`mobile-nav-item ${sectionActive ? "active" : ""}`}
              onClick={() => setMobileSheetSection(mobileSheetSection === section.label ? null : section.label)}
            >
              <span className="material-symbols-outlined">{visible[0]?.icon || "apps"}</span>
              <span>{section.label || "Links"}</span>
            </button>
          );
        })}
      </nav>

      {/* MOBILE SECTION SHEET */}
      {mobileSheetSection && (
        <div className="mobile-sheet-overlay" onClick={() => setMobileSheetSection(null)}>
          <div className="mobile-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-sheet-handle" />
            <p className="mobile-sheet-title">{mobileSheetSection}</p>
            <div className="mobile-sheet-items">
              {navSections
                .find((s) => s.label === mobileSheetSection)
                ?.items.filter((n) => powerLevel >= n.minPower)
                .map((item) => {
                  const isItemActive = item.deptId
                    ? (activePanel === "department" && activeDeptId === item.deptId)
                    : activePanel === item.id;
                  return (
                    <button
                      key={item.id}
                      className={`mobile-sheet-item ${isItemActive ? "active" : ""}`}
                      onClick={() => {
                        if (item.deptId) { setActiveDeptId(item.deptId); setActivePanel("department"); }
                        else setActivePanel(item.id);
                        setMobileSheetSection(null);
                      }}
                    >
                      <span className="material-symbols-outlined">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      {powerLevel >= 100 && activePanel === "dashboard" && (
        <button className="fab" onClick={() => setActivePanel("announcements")} title="Post Announcement">
          <span className="material-symbols-outlined">add</span>
        </button>
      )}

      {/* LOGOUT CONFIRMATION */}
      {showLogoutConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div onClick={() => setShowLogoutConfirm(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} />
          <div style={{ position: "relative", maxWidth: 400, width: "100%", background: "var(--bg-card)", borderRadius: 24, border: "1px solid var(--border-light)", boxShadow: "var(--shadow-lg)", padding: "2rem", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(239,68,68,0.12)", color: "var(--status-error)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28 }}>logout</span>
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: "1.15rem", fontWeight: 800 }}>Sign out?</h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 1.5rem", lineHeight: 1.5 }}>
              You'll be signed out of the portal. You can sign back in anytime.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn outline" style={{ flex: 1, justifyContent: "center", padding: "0.75rem" }} onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
              <button className="btn" style={{ flex: 1, justifyContent: "center", padding: "0.75rem", background: "var(--status-error)", border: "2px solid var(--text-primary)", boxShadow: "3px 3px 0 var(--text-primary)" }} onClick={async () => {
                setShowLogoutConfirm(false);
                try { await fetch(apiUrl("/api/auth/logout"), { method: "POST", headers: { Authorization: `Bearer ${authToken}` }, signal: AbortSignal.timeout(10_000) }); } catch {}
                clearMemberSession();
              }}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
