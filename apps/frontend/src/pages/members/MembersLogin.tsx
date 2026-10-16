import { useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../../lib/api";
import { useTheme } from "../../context/ThemeContext";
import { createMemberSession, GOOGLE_SIGN_IN_URL } from "../../lib/member-session";

interface MembersLoginProps {
  onLogin: (
    token: string,
    email: string,
    powerLevel?: number,
    departmentId?: string,
    roleId?: string,
    expiresAt?: string,
  ) => void;
  oauthLoading?: boolean;
  oauthError?: string | null;
}

export default function MembersLogin({ onLogin, oauthLoading, oauthError }: MembersLoginProps) {
  const { isDark, toggle: toggleTheme } = useTheme();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleGoogleLogin = () => {
    window.location.href = GOOGLE_SIGN_IN_URL;
  };

  const handleTokenLogin = async () => {
    const t = token.trim();
    if (!t) return alert("Enter token");
    setLoading(true);
    setLoginError("");
    try {
      const data = await createMemberSession(t);
      setToken("");
      onLogin(data.token, data.email, data.powerLevel, data.departmentId, data.roleId, data.expiresAt);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotToken = async () => {
    if (!forgotEmail) return;
    setForgotLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/forgot-token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (data.success) {
        setForgotSent(true);
      } else if (res.status === 429) {
        alert(data.error || "Daily email quota reached. Please contact the administrator or try again after 24 hours.");
      } else {
        alert("Something went wrong. Try again later.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="login-page">
      <button
        onClick={toggleTheme}
        className="login-theme-toggle"
        title="Toggle Theme"
        aria-label="Toggle Theme"
      >
        <span className="material-symbols-outlined">{isDark ? "light_mode" : "dark_mode"}</span>
      </button>

      {/* Brand panel */}
      <aside className="login-brand">
        <div className="login-brand-inner">
          <img src="/images/official-logo.png" alt="180 Degrees Consulting" className="login-brand-logo" />
          <p className="login-brand-kicker">180 Degrees Consulting · VIT Chennai</p>
          <h2 className="login-brand-headline">
            Consulting with <em>purpose</em>, delivering <em>impact</em>.
          </h2>
          <p className="login-brand-copy">
            Part of the world's largest university-based consultancy — connecting students
            with social enterprises to achieve meaningful change.
          </p>
        </div>
        <p className="login-brand-foot">Member Portal</p>
      </aside>

      {/* Form panel */}
      <main className="login-panel">
      <div style={{ maxWidth: 420, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "2.25rem" }}>
          <img
            src="/images/official-logo.png"
            alt="180 Degrees Consulting"
            style={{ width: 56, height: 56, objectFit: "contain", margin: "0 auto 0.875rem", display: "block" }}
          />
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Welcome back</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "15px", marginTop: "8px" }}>
            Sign in to the member portal to continue.
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
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {loginError && <p role="alert" style={{ color: "var(--status-error)" }}>{loginError}</p>}
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>Admin Token</label>
              <input
                className="input"
                style={{ padding: "0.875rem 1rem", fontSize: "15px" }}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter your private token"
                type="password"
                autoComplete="off"
              />
            </div>

            <button
              onClick={() => handleTokenLogin()}
              className="btn"
              style={{ padding: "0.875rem", borderRadius: 12, justifyContent: "center", fontSize: "15px", width: "100%" }}
              disabled={loading}
            >
              {loading ? "Logging in..." : "Continue with Token"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: "var(--border-light)" }} />
              <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "var(--border-light)" }} />
            </div>

            <button
              onClick={handleGoogleLogin}
              className="btn outline"
              style={{ width: "100%", padding: "0.875rem", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: "15px" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
               <button
                  onClick={() => { setShowForgot(!showForgot); setForgotSent(false); }}
                  style={{
                    background: "none", border: "none", color: "var(--accent)",
                    cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0,
                  }}
                >
                  Forgot token?
                </button>
                <Link
                  to="/request-account"
                  style={{ color: "var(--text-secondary)", fontSize: 13, textDecoration: "none", fontWeight: 600 }}
                >
                  Request account
                </Link>
            </div>

            {showForgot && (
              <div style={{ marginTop: "0.5rem", padding: "1.25rem", background: "var(--surface-container-low)", borderRadius: 16, border: "1px solid var(--border-light)" }}>
                {forgotSent ? (
                  <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    If that email is registered, your token has been sent. Check your inbox.
                  </p>
                ) : (
                  <>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>Registered Email</label>
                    <input
                      className="input"
                      style={{ padding: "0.75rem", fontSize: "14px" }}
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="Enter your email"
                      type="email"
                    />
                    <button
                      onClick={handleForgotToken}
                      className="btn"
                      disabled={forgotLoading || !forgotEmail}
                      style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
                    >
                      {forgotLoading ? "Sending..." : "Send Token"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: "2rem", color: "var(--text-tertiary)", fontSize: "13px" }}>
          &copy; 2026 180 Degrees Consulting · VIT Chennai
        </p>
      </div>
      </main>

      {oauthError && (
        <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 999, background: "var(--bg-card)", padding: "1.5rem 2rem", borderRadius: 16, border: "2px solid var(--danger, #e74c3c)", boxShadow: "var(--shadow-lg)", color: "var(--text-primary)", fontSize: 15, maxWidth: 500, textAlign: "center", lineHeight: 1.5 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 32, color: "var(--status-error)", display: "block", marginBottom: "0.75rem" }}>error</span>
          {oauthError}
        </div>
      )}

      {oauthLoading && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 998,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "1rem",
        }}>
          <div style={{ background: "var(--bg-card)", padding: "2rem", borderRadius: 24, textAlign: "center", boxShadow: "var(--shadow-lg)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, display: "block", marginBottom: "1rem" }}>sync</span>
            <p style={{ margin: 0, fontSize: 15, color: "var(--text-secondary)" }}>Please wait...</p>
          </div>
        </div>
      )}
    </div>
  );
}
