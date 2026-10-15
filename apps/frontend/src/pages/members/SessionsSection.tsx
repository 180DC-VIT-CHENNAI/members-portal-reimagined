import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../lib/api';

type DeviceSession = { id: string; device_label: string; created_at: string; expires_at: string; current: boolean };

export default function SessionsSection({ authToken, onSignedOut }: { authToken: string; onSignedOut: () => void }) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const latestToken = useRef(authToken);
  latestToken.current = authToken;
  async function load() {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/sessions'), { headers: { Authorization: `Bearer ${authToken}` } });
      if (latestToken.current !== authToken) return;
      if (response.status === 401) { onSignedOut(); return; }
      const data = await response.json();
      if (latestToken.current !== authToken) return;
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load sessions');
      setSessions(data.data);
      setError('');
    } catch (e) { if (latestToken.current === authToken) setError(e instanceof Error ? e.message : 'Unable to load sessions'); }
    finally { if (latestToken.current === authToken) setLoading(false); }
  }
  useEffect(() => { load(); }, [authToken]);
  async function revoke(session: DeviceSession) {
    if (!confirm(`Sign out ${session.current ? 'this browser' : session.device_label}?`)) return;
    setBusy(session.id);
    try {
      const response = await fetch(apiUrl(`/api/auth/sessions/${session.id}`), { method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` } });
      const data = await response.json();
      if (latestToken.current !== authToken) return;
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to revoke session');
      if (session.current) onSignedOut(); else await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to revoke session'); }
    finally { setBusy(''); }
  }
  return <section className="dashboard-card" style={{ gridColumn: '1 / -1' }} aria-label="Signed-in sessions">
    <h3>Signed-in sessions</h3>
    <p style={{ color: 'var(--text-secondary)' }}>Review your sessions and sign out any you no longer use. Device labels are supplied at sign-in.</p>
    {error && <p role="alert" style={{ color: 'var(--status-error)' }}>{error}</p>}
    <button className="btn outline" onClick={load} disabled={loading}>Refresh sessions</button>
    {loading ? <p role="status">Loading sessions…</p> : <ul style={{ listStyle: 'none', padding: 0 }}>
      {sessions.map(session => <li key={session.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border-light)' }}>
        <div><strong>{session.device_label}{session.current ? ' · This session' : ''}</strong><div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Expires {new Date(session.expires_at).toLocaleString()}</div></div>
        <button className="btn outline" onClick={() => revoke(session)} disabled={!!busy}>Sign out</button>
      </li>)}
      {!sessions.length && !error && <li>No active device sessions.</li>}
    </ul>}
  </section>;
}
