import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Button, Linking, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { ApiError, memberClient, type Session, type WorkQueue } from './src/api';
import SessionsPanel from './src/SessionsPanel';
import { decodeStoredSession } from './src/stored-session';
const SESSION_KEY = '180dc.member.session';
export default function App() {
  const dark = useColorScheme() === 'dark';
  const generation = useRef(0);
  const [session, setSession] = useState<Session | null>(null);
  const [queue, setQueue] = useState<WorkQueue | null>(null);
  const [sourceToken, setSourceToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const client = useMemo(() => { try { return memberClient(process.env.EXPO_PUBLIC_API_URL || ''); } catch { return null; } }, []);
  const color = { color: dark ? '#f5f5f5' : '#171717' };
  async function clearSession() {
    generation.current++; setBusy(true); setSession(null); setQueue(null); setSourceToken('');
    await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => setError('Could not clear saved access. Revoke this device in your web profile.'));
    setBusy(false);
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!client) return;
        const raw = await SecureStore.getItemAsync(SESSION_KEY);
        if (!raw) return;
        const saved = decodeStoredSession(raw);
        if (!saved) {
          await SecureStore.deleteItemAsync(SESSION_KEY); return;
        }
        const data = await client.queue(saved.token);
        if (active) { setSession(saved); setQueue(data); }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
        if (active) setError('Could not restore access. Sign in again when connected.');
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [client]);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => { void clearSession(); setError('Session expired. Sign in again.'); }, Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [session]);
  async function refresh() {
    if (!client || !session || busy) return;
    const version = generation.current;
    setBusy(true); setError('');
    try { const data = await client.queue(session.token); if (version === generation.current) setQueue(data); }
    catch (err) {
      if (version !== generation.current) return;
      if (err instanceof ApiError && err.status === 401) await clearSession();
      setError(err instanceof Error ? err.message : 'Could not refresh');
    } finally { if (version === generation.current) setBusy(false); }
  }
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => listener.remove();
  }, [session, busy, client]);
  async function signIn() {
    if (!client || busy || !sourceToken.trim()) return;
    const token = sourceToken.trim(); setSourceToken(''); setBusy(true); setError('');
    let issued: Session | null = null;
    try {
      issued = await client.signIn(token);
      const data = await client.queue(issued.token);
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(issued));
      setSession(issued); setQueue(data);
    } catch (err) {
      if (issued) await client.logout(issued.token).catch(() => {});
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally { setBusy(false); }
  }
  async function signOut() {
    if (!client || !session || busy) return;
    generation.current++;
    const token = session.token; setBusy(true); setQueue(null); setSession(null);
    const results = await Promise.allSettled([SecureStore.deleteItemAsync(SESSION_KEY), client.logout(token)]);
    setError(results.every(result => result.status === 'fulfilled') ? '' : 'Sign-out needs attention. Reconnect and revoke this device in your web profile if needed.');
    setBusy(false);
  }

  async function complete(project: string, task: string) {
    if (!client || !session || busy) return;
    const version = generation.current;
    setBusy(true); setError('');
    try { await client.complete(session.token, project, task);
      if (version !== generation.current) return;
      const data = await client.queue(session.token); if (version === generation.current) setQueue(data);
    }
    catch (err) {
      if (version !== generation.current) return;
      if (err instanceof ApiError && err.status === 401) await clearSession();
      setError(err instanceof Error ? err.message : 'Could not complete task');
    } finally { if (version === generation.current) setBusy(false); }
  }
  return <View style={[styles.screen, { backgroundColor: dark ? '#121212' : '#ffffff' }]}>
    <StatusBar style={dark ? 'light' : 'dark'} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.heading, color]} accessibilityRole="header">180DC · Today</Text>
      {!client && <Text style={color}>The app’s service address has not been configured.</Text>}
      {error !== '' && <Text style={[color, styles.message]} accessibilityRole="alert">{error}</Text>}
      {busy && <Text style={color} accessibilityLiveRegion="polite">Working…</Text>}
      {!session && client && <>
        <Text style={color}>Sign in with your member access token.</Text>
        <TextInput accessibilityLabel="Member access token" secureTextEntry autoCapitalize="none" autoCorrect={false} value={sourceToken} onChangeText={setSourceToken} editable={!busy} style={[styles.input, color]} />
        <Button title="Sign in" disabled={busy || !sourceToken.trim()} onPress={() => void signIn()} />
      </>}
      {session && <>
        <Text style={color}>{session.name}</Text>
        <Button title="Refresh work" disabled={busy} onPress={() => void refresh()} />
        <Button title="Sign out" disabled={busy} onPress={() => void signOut()} />
      </>}
      {session && client && <SessionsPanel key={session.token} token={session.token} client={client} color={color.color} onSignedOut={() => { void clearSession(); }} />}
      {queue && <>
        <Text style={color}>Last updated {new Date(queue.generatedAt).toLocaleString()}</Text>
        <Text style={[styles.subheading, color]} accessibilityRole="header">My open tasks</Text>
        {!queue.tasks.length && <Text style={color}>No open assigned tasks.</Text>}
        {queue.tasks.map(task => <View key={task.id} style={styles.card}>
          <Text style={color}>{task.title}</Text><Text style={color}>{task.project_name}</Text>
          {task.due_date && <Text style={color}>Task due {task.due_date}</Text>}
          {task.priority && <Text style={color}>{task.priority} priority</Text>}
          {task.project_deadline && <Text style={color}>Project due {task.project_deadline}</Text>}
          <Button title="Complete task" accessibilityLabel={`Complete ${task.title}`} disabled={busy} onPress={() => void complete(task.project_id, task.id)} />
        </View>)}
        {queue.hasMoreTasks && <Text style={color}>Showing the first 100 tasks. More assigned tasks are available in the web portal’s project sections.</Text>}
        <Text style={[styles.subheading, color]} accessibilityRole="header">Upcoming meetings</Text>
        {!queue.meetings.length && <Text style={color}>No meetings in the next seven days.</Text>}
        {queue.meetings.map(meet => <View key={`${meet.type}-${meet.id}`} style={styles.card}>
          <Text style={color}>{meet.title}</Text>
          <Text style={color}>{new Date(/Z$|[+-]\d\d:\d\d$/.test(meet.scheduled_at) ? meet.scheduled_at : meet.scheduled_at.replace(' ', 'T') + 'Z').toLocaleString()}</Text>
          {meet.meet_link?.startsWith('https://') && <Button title="Join meeting" onPress={() => { void Linking.openURL(meet.meet_link!).catch(() => setError('Could not open meeting')); }} />}
        </View>)}
        {queue.hasMoreMeetings && <Text style={color}>Showing the first 20 meetings. More meetings are available in the web portal’s meeting sections.</Text>}
        <Text style={[styles.subheading, color]} accessibilityRole="header">Needs attention</Text>
        <Text style={color}>{queue.attention.incomingTransfers} pending role invitation(s)</Text>
        {queue.attention.accountRequests !== undefined && <Text style={color}>{queue.attention.accountRequests} pending account request(s)</Text>}
      </>}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, paddingTop: 48 }, content: { padding: 20, gap: 16 }, heading: { fontSize: 28, fontWeight: '700' }, subheading: { fontSize: 22, fontWeight: '600' }, input: { minHeight: 48, borderWidth: 1, borderColor: '#767676', borderRadius: 8, padding: 12 }, card: { borderWidth: 1, borderColor: '#767676', borderRadius: 12, padding: 16, gap: 10 }, message: { borderLeftWidth: 3, borderLeftColor: '#dc2626', paddingLeft: 12 } });
