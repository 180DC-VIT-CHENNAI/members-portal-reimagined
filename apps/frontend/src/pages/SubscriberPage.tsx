import { useState } from "react";
import { apiUrl } from "../lib/api";
import { useTheme } from "../context/ThemeContext";

async function postJson(path: string, body: unknown) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.success, message: data.message || data.error || "Something went wrong. Please try again." };
}

export default function SubscriberPage() {
  const { isDark, toggle: toggleTheme } = useTheme();
  const [confirmToken] = useState(() => new URLSearchParams(window.location.search).get("confirm"));
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      const result = await postJson("/api/newsletter/subscribe", { email: email.trim(), name: name.trim() || undefined });
      setMsg(result.message);
      setDone(result.ok);
    } catch {
      setMsg("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    setMsg("");
    try {
      const result = await postJson("/api/newsletter/confirm", { token: confirmToken });
      setMsg(result.message);
      setDone(result.ok);
      if (result.ok) window.history.replaceState(null, "", "/subscriber");
    } catch {
      setMsg("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.75rem 1rem", borderRadius: 12, border: "1px solid var(--border-light)",
    background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 15, boxSizing: "border-box",
  };

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
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <img
            src="/images/official-logo.png"
            alt="180 Degrees Consulting"
            style={{
              width: 64, height: 64, borderRadius: 16,
              objectFit: "contain",
              margin: "0 auto 1rem",
              boxShadow: "0 4px 12px rgba(141, 198, 63, 0.3)",
            }}
          />
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0 }}>Subscribe to Newsletter</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "15px", marginTop: "8px" }}>
            Get our latest newsletters delivered to your inbox.
          </p>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "2rem",
            borderRadius: 24,
            border: "1px solid var(--border-light)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {confirmToken ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 1.25rem" }}>
                {done ? "You're all set." : "One last step: confirm that you want to receive the newsletter."}
              </p>
              {!done && (
                <button onClick={handleConfirm} disabled={busy} className="btn" style={{ width: "100%", padding: "0.875rem", borderRadius: 12, justifyContent: "center", fontSize: "15px" }}>
                  {busy ? "Confirming..." : "Confirm subscription"}
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubscribe} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy || done} aria-label="Email address" style={inputStyle} />
              <input type="text" placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} disabled={busy || done} aria-label="Name" maxLength={120} style={inputStyle} />
              <button type="submit" disabled={busy || done || !email.trim()} className="btn" style={{ width: "100%", padding: "0.875rem", borderRadius: 12, justifyContent: "center", fontSize: "15px" }}>
                {done ? "Check your inbox" : busy ? "Sending..." : "Subscribe"}
              </button>
            </form>
          )}

          {msg && (
            <p role="status" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-secondary)", textAlign: "center" }}>
              {msg}
            </p>
          )}
        </div>

        <div style={{ marginTop: 16, padding: "0 4px", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
          <p style={{ fontWeight: 700, color: "var(--text-secondary)", margin: "0 0 6px", fontSize: 12, letterSpacing: 0.5 }}>Terms and Conditions</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>By subscribing, you consent to receive newsletter communications from 180 Degrees Consulting via email.</li>
            <li>You also agree to receive updates about events conducted by 180 Degrees Consulting, including workshops, seminars, and promotional events.</li>
            <li>You may unsubscribe at any time by visiting <a href="https://180dcvitc.org/unsubscribe" style={{ color: "var(--accent)", textDecoration: "underline" }}>180dcvitc.org/unsubscribe</a>.</li>
          </ul>
        </div>

        <p style={{ textAlign: "center", marginTop: "2rem", color: "var(--text-tertiary)", fontSize: "13px" }}>
          &copy; 2026 180 Degrees Consulting. All rights reserved.
        </p>
      </div>
    </div>
  );
}
