import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { apiUrl } from "../lib/api";
import { useTheme } from "../context/ThemeContext";

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const { token } = useParams();
  const emailParam = searchParams.get("email") || "";
  const [resolvedEmail, setResolvedEmail] = useState("");
  const tokenRequested = useRef("");
  const { isDark, toggle: toggleTheme } = useTheme();

  const [inputEmail, setInputEmail] = useState(emailParam);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "already" | "not-found" | "error">("idle");

  useEffect(() => {
    if (token) {
      // Run once per token: StrictMode re-runs effects, and a second POST
      // would report "already unsubscribed".
      if (tokenRequested.current !== token) {
        tokenRequested.current = token;
        unsubscribeWithToken(token);
      }
      return;
    }
    if (emailParam && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailParam)) {
      setInputEmail(emailParam);
      doUnsubscribe(emailParam);
    }
  }, [token, emailParam]);

  // Personal links from our emails carry a token; unsubscribing is a POST so
  // link scanners that prefetch the page URL never trigger it.
  const unsubscribeWithToken = async (value: string) => {
    setStatus("loading");
    try {
      const res = await fetch(apiUrl(`/api/newsletter/unsubscribe/${encodeURIComponent(value)}`), { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.email) setResolvedEmail(data.email);
        if (data.status === "already") setStatus("already");
        else if (data.status === "not_found") setStatus("not-found");
        else setStatus("success");
      } else if (res.status === 400) {
        setStatus("not-found");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const doUnsubscribe = async (email: string) => {
    setStatus("loading");
    try {
      const res = await fetch(apiUrl(`/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}`));
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.status === "already") setStatus("already");
        else if (data.status === "not_found") setStatus("not-found");
        else setStatus("success");
      } else if (res.status === 400) {
        setStatus("not-found");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputEmail.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus("not-found");
      return;
    }
    doUnsubscribe(trimmed);
  };

  const messages: Record<string, { title: string; desc: string; icon: string }> = {
    idle: { title: "Unsubscribe from Newsletter", desc: "Enter the email address you'd like to remove from the 180DC newsletter.", icon: "\u2713" },
    loading: { title: "Unsubscribing...", desc: "Please wait while we process your request.", icon: "..." },
    success: { title: "Successfully Unsubscribed", desc: "You have been unsubscribed from the 180DC newsletter. You will no longer receive newsletter emails from us.", icon: "\u2713" },
    already: { title: "Already Unsubscribed", desc: "You are not currently subscribed to the 180DC newsletter, or you have already unsubscribed.", icon: "\u2713" },
    "not-found": { title: "Email Not Found", desc: "This email address is not subscribed to our newsletter. Please check and try again.", icon: "!" },
    error: { title: "Something Went Wrong", desc: "We couldn't process your unsubscribe request. Please try again later.", icon: "!" },
  };

  const showForm = status === "idle" || status === "not-found" || status === "error";
  const msg = messages[status];

  return (
    <div
      style={{
        background: "var(--bg-primary)",
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div style={{ position: "absolute", top: 24, left: 24, display: "flex", gap: 10 }}>
        <a
          href="https://180dcvitc.org"
          style={{
            padding: "10px 16px", border: "1px solid var(--border-light)",
            background: "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer",
            borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            boxShadow: "var(--shadow-sm)", textDecoration: "none", fontSize: 14, fontWeight: 600,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>home</span>
          Home
        </a>
      </div>
      <button
        onClick={toggleTheme}
        style={{
          position: "absolute", top: 24, right: 24,
          padding: "10px", border: "1px solid var(--border-light)",
          background: "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer",
          borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "var(--shadow-sm)",
        }}
        title="Toggle Theme"
      >
        <span className="material-symbols-outlined">{isDark ? "light_mode" : "dark_mode"}</span>
      </button>

      <div style={{ maxWidth: 420, width: "100%" }}>
        <div
          style={{
            background: "var(--bg-card)",
            padding: "2.5rem 2rem",
            borderRadius: 24,
            border: "1px solid var(--border-light)",
            boxShadow: "var(--shadow-lg)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 64, height: 64, borderRadius: "50%",
              background: status === "success" || status === "already" ? "var(--status-success)" : "var(--accent)",
              color: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, fontWeight: 800, margin: "0 auto 1.25rem",
              boxShadow: status === "success" || status === "already"
                ? "0 4px 12px rgba(34,197,94,0.3)"
                : "0 4px 12px rgba(141, 198, 63, 0.3)",
            }}
          >
            {status === "loading" ? "..." : msg.icon}
          </div>

          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 8px", color: "var(--text-primary)" }}>
            {msg.title}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.6, margin: "0 0 1.5rem" }}>
            {msg.desc}
          </p>

          {showForm && (
            <form onSubmit={handleSubmit} style={{ marginBottom: "1.25rem" }}>
              <input
                type="email"
                placeholder="Enter your email address"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                required
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  border: "2px solid var(--border-light)", background: "var(--bg-primary)",
                  color: "var(--text-primary)", fontSize: 14, outline: "none",
                  boxSizing: "border-box", marginBottom: 10,
                }}
              />
              <button
                type="submit"
                style={{
                  display: "inline-block", padding: "10px 28px", background: "var(--status-error)", color: "#fff",
                  border: "none", borderRadius: 50, fontSize: 13, fontWeight: 800,
                  textTransform: "uppercase" as const, letterSpacing: 1, cursor: "pointer",
                }}
              >
                Unsubscribe
              </button>
            </form>
          )}

          {!showForm && (resolvedEmail || emailParam) && (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 1.25rem" }}>
              {resolvedEmail || emailParam}
            </p>
          )}

          <a
            href="https://180dcvitc.org"
            style={{
              display: "inline-block", padding: "10px 28px", background: "var(--accent)", color: "#fff",
              textDecoration: "none", borderRadius: 50, fontSize: 13, fontWeight: 800,
              textTransform: "uppercase" as const, letterSpacing: 1,
            }}
          >
            Visit Website
          </a>
        </div>

        <p style={{ textAlign: "center", marginTop: "2rem", color: "var(--text-tertiary)", fontSize: "13px" }}>
          &copy; 2026 180 Degrees Consulting. All rights reserved.
        </p>
      </div>
    </div>
  );
}
