import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Text, View } from 'react-native';
import { ApiError, type DeviceSession, memberClient } from './api';

type Props = { token: string; client: ReturnType<typeof memberClient>; color: string; onSignedOut: () => void };
export default function SessionsPanel({ token, client, color, onSignedOut }: Props) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  async function load() {
    const version = ++epoch.current;
    setBusy(true); setError('');
    try {
      const data = await client.sessions(token);
      if (version === epoch.current) setSessions(data);
    } catch (err) {
      if (version !== epoch.current) return;
      if (err instanceof ApiError && err.status === 401) onSignedOut();
      else setError(err instanceof Error ? err.message : 'Could not load sessions');
    } finally { if (version === epoch.current) setBusy(false); }
  }
  useEffect(() => { setSessions([]); void load(); return () => { epoch.current++; }; }, [token, client]);
  async function revoke(session: DeviceSession, version: number) {
    if (version !== epoch.current) return;
    setBusy(true); setError('');
    try {
      await client.revoke(token, session.id);
      if (version !== epoch.current) return;
      if (session.current) onSignedOut(); else await load();
    } catch (err) {
      if (version !== epoch.current) return;
      if (err instanceof ApiError && err.status === 401) onSignedOut();
      else setError(err instanceof Error ? err.message : 'Could not revoke session');
    } finally { if (version === epoch.current) setBusy(false); }
  }
  function confirmRevoke(session: DeviceSession) {
    const version = epoch.current;
    Alert.alert('Sign out device?', session.current ? 'This will sign you out of this app.' : `Sign out ${session.device_label}? Device labels are supplied at sign-in.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void revoke(session, version) },
    ]);
  }
  return <View style={{ gap: 12 }}>
    <Text style={{ color, fontSize: 22, fontWeight: '600' }} accessibilityRole="header">Signed-in sessions</Text>
    <Text style={{ color }}>Review device access. Labels are supplied at sign-in.</Text>
    <Button title="Refresh sessions" disabled={busy} onPress={() => void load()} />
    {busy && <Text style={{ color }} accessibilityLiveRegion="polite">Updating sessions…</Text>}
    {!!error && <Text style={{ color }} accessibilityRole="alert">{error}</Text>}
    {!busy && !error && !sessions.length && <Text style={{ color }}>No active device sessions.</Text>}
    {sessions.map(session => <View key={session.id} style={{ gap: 8, paddingVertical: 12 }}>
      <Text style={{ color }}>{session.device_label}{session.current ? ' · This app' : ''}</Text>
      <Text style={{ color }}>Expires {new Date(session.expires_at).toLocaleString()}</Text>
      <Button title="Sign out device" accessibilityLabel={`Sign out ${session.current ? 'this app' : session.device_label}`} disabled={busy} onPress={() => confirmRevoke(session)} />
    </View>)}
  </View>;
}
