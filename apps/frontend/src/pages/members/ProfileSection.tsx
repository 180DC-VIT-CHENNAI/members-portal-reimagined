import { useEffect, useState } from "react";
import { useClerk } from "@clerk/react";
import { apiUrl } from "../../lib/api";
import { createMemberSession } from "../../lib/member-session";
import SessionsSection from "./SessionsSection";

interface Props {
  authToken: string;
  email: string;
  powerLevel: number;
  departmentId: string | null;
  deptName: string;
  oauthEnabled: boolean;
  statusMsg: string | null;
  onOAuthStatusChange: (msg: string | null) => void;
  onCredentialChange: (token: string, expiresAt: string) => void;
  onSignedOut: () => void;
}

export default function ProfileSection({ authToken, email, powerLevel, departmentId, deptName, oauthEnabled, statusMsg, onOAuthStatusChange, onCredentialChange, onSignedOut }: Props) {
  const clerk = useClerk();
  const [showToken, setShowToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [currentToken, setCurrentToken] = useState(authToken);
  const isDeviceSession = currentToken.startsWith('180dc_session_');
  useEffect(() => { setCurrentToken(authToken); setShowToken(false); }, [authToken]);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      const el = document.createElement("textarea");
      el.value = currentToken;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  };

  const handleRotate = async () => {
    setRotating(true);
    setRotateError(null);
    try {
      const res = await fetch(apiUrl("/api/auth/rotate-token"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${currentToken}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (res.status === 429) {
        const mins = Math.ceil((data.retryAfter || 3600) / 60);
        setRotateError(`Rate limited. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`);
        return;
      }
      if (!data.success) {
        setRotateError(data.error || "Failed to rotate token.");
        return;
      }
      const session = await createMemberSession(data.token);
      setCurrentToken(session.token);
      onCredentialChange(session.token, session.expiresAt);
      setShowToken(false);
    } catch {
      setRotateError("Network error. Please try again.");
    } finally {
      setRotating(false);
    }
  };

  const handleConnectGoogle = () => {
    sessionStorage.setItem("clnk", "link");
    clerk.redirectToSignIn({
      signInFallbackRedirectUrl: "/members",
      signInForceRedirectUrl: "/members",
    });
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch(apiUrl("/api/auth/unlink-clerk"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (data.success) {
        onOAuthStatusChange("Google login disabled.");
      } else {
        onOAuthStatusChange(data.error || "Failed to disconnect.");
      }
    } catch {
      onOAuthStatusChange("Network error. Try again.");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {statusMsg && (
        <div style={{
          padding: "1rem 1.25rem",
          borderRadius: 12,
          background: statusMsg.toLowerCase().includes("fail") || statusMsg.toLowerCase().includes("error")
            ? "rgba(239, 68, 68, 0.1)"
            : "rgba(16, 185, 129, 0.1)",
          border: `1px solid ${
            statusMsg.toLowerCase().includes("fail") || statusMsg.toLowerCase().includes("error")
              ? "var(--status-error)"
              : "var(--status-success)"
          }`,
          color: statusMsg.toLowerCase().includes("fail") || statusMsg.toLowerCase().includes("error")
            ? "var(--status-error)"
            : "var(--status-success)",
          fontSize: 14,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            {statusMsg.toLowerCase().includes("fail") || statusMsg.toLowerCase().includes("error") ? "error" : "check_circle"}
          </span>
          {statusMsg}
        </div>
      )}

      <div className="members-grid">
        <div className="dashboard-card" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "2rem", padding: "2.5rem" }}>
          <div style={{ 
            width: 96, height: 96, borderRadius: "50%", 
            background: "var(--accent-bg)", color: "var(--accent)", 
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, fontWeight: 800, border: "4px solid var(--bg-card)",
            boxShadow: "var(--shadow-md)"
          }}>
            {email?.[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>{email?.split("@")[0]}</h2>
            <div style={{ color: "var(--text-secondary)", fontSize: "15px", marginTop: "4px", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>mail</span>
                {email}
              </span>
              {departmentId && (
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>domain</span>
                  {deptName}
                </span>
              )}
            </div>
            <div style={{ marginTop: "1rem", display: "flex", gap: "8px" }}>
               <span style={{ 
                 padding: "4px 12px", borderRadius: 20, background: "var(--surface-container)", 
                 fontSize: 12, fontWeight: 700, color: "var(--text-secondary)",
                 display: "flex", alignItems: "center", gap: 4
               }}>
                 <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span>
                 Power {powerLevel}
               </span>
               <span style={{ 
                  padding: "4px 12px", borderRadius: 20, background: "rgba(16, 185, 129, 0.1)", 
                  fontSize: 12, fontWeight: 700, color: "var(--status-success)",
                 display: "flex", alignItems: "center", gap: 4
               }}>
                 <span className="material-symbols-outlined" style={{ fontSize: 14 }}>verified</span>
                 Active Member
               </span>
            </div>
          </div>
        </div>

        <div className="dashboard-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
            <span className="material-symbols-outlined" style={{ color: "var(--primary-green)" }}>security</span>
            <h3 style={{ margin: 0 }}>Authentication</h3>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ padding: "1rem", borderRadius: 12, border: "1px solid var(--border-light)", background: "var(--surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Token-based Login</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>Secure API & session access</div>
                </div>
                  <span style={{ fontSize: 10, fontWeight: 800, background: "var(--status-success)", color: "white", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>Primary</span>
              </div>
            </div>

            <div style={{ padding: "1rem", borderRadius: 12, border: "1px solid var(--border-light)", background: "var(--surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Google Account</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {oauthEnabled ? "Linked to your portal account" : "Link for passwordless login"}
                  </div>
                </div>
                {oauthEnabled ? (
                  <span style={{ fontSize: 10, fontWeight: 800, background: "var(--accent)", color: "white", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>Linked</span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 800, background: "var(--text-tertiary)", color: "white", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>Unlinked</span>
                )}
              </div>
              <div style={{ marginTop: "1rem" }}>
                {oauthEnabled ? (
                  <button onClick={handleDisconnect} className="btn outline" disabled={disconnecting} style={{ width: "100%", padding: "8px", fontSize: 13, borderColor: "var(--status-error)", color: "var(--status-error)" }}>
                    {disconnecting ? "Unlinking..." : "Unlink Google Account"}
                  </button>
                ) : (
                  <button onClick={handleConnectGoogle} className="btn" style={{ width: "100%", padding: "8px", fontSize: 13, gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Link Google Account
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-card" style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
            <span className="material-symbols-outlined" style={{ color: "var(--primary-green)" }}>key</span>
            <h3 style={{ margin: 0 }}>Account access</h3>
          </div>
          
          <div style={{ display: "flex", gap: "1rem", alignItems: "stretch", flexWrap: "wrap" }}>
            {!isDeviceSession && <div style={{
              flex: 1, minWidth: 280, padding: "1rem 1.25rem", 
              background: "var(--surface)", border: "1px solid var(--border-light)", 
              borderRadius: 12, fontFamily: "monospace", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
              <span style={{ wordBreak: "break-all", color: showToken ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                {showToken ? currentToken : "••••••••••••••••••••••••••••••••"}
              </span>
              <button 
                onClick={() => setShowToken(!showToken)} 
                style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", display: "flex" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{showToken ? "visibility_off" : "visibility"}</span>
              </button>
            </div>}
            
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {!isDeviceSession && <button className="btn outline" onClick={handleCopy} style={{ gap: 8, padding: "0 1.5rem" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{tokenCopied ? "check" : "content_copy"}</span>
                {tokenCopied ? "Copied" : "Copy"}
              </button>}
              
              <button className="btn" onClick={handleRotate} disabled={rotating} style={{ gap: 8, padding: "0 1.5rem" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{rotating ? "sync" : "refresh"}</span>
                {rotating ? "Rotating..." : "Rotate"}
              </button>
            </div>
          </div>

          {rotateError && (
            <div style={{ marginTop: "1rem", color: "var(--status-error)", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>info</span>
              {rotateError}
            </div>
          )}

          <div style={{ 
            marginTop: "1.5rem", padding: "1rem", borderRadius: 12, 
            background: "var(--surface-container-low)", border: "1px solid var(--border-light)",
            fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6
          }}>
            <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
              Security Warning
            </div>
            Your token is like a password. Do not share it with anyone. Rotating your token will immediately invalidate the previous one and log you out of other sessions using it.
          </div>
        </div>
        <SessionsSection authToken={authToken} onSignedOut={onSignedOut} />
      </div>
    </div>
  );
}
