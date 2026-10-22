import { type FormEvent, useEffect, useState } from 'react';
import { Alert, BackLink, Button, Card, ErrorState, LoadingBlock, PageHeader, ProblemAlert, TextField } from '../components/ui.tsx';
import { api, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import type { RouteMap } from 'void/routes';

type Preferences = RouteMap['/api/notification-preferences']['GET'] extends { output: infer O } ? O : never;
type Preference = Preferences['preferences'][number];

const CATEGORY = {
  mentions: { title: 'Mentions', description: 'Someone mentions you in a message or channel you can read.' },
  tasks: { title: 'Tasks', description: 'Tasks assigned to you, comments on your tasks and deadlines due today or tomorrow.' },
} as const satisfies Record<Preference['category'], { title: string; description: string }>;

/** Per-category in-app notices, the (not yet sent) email digest opt-in and quiet hours. */
export function NotificationPreferencesPage() {
  const loaded = useLoad(() => api('/api/notification-preferences'), []);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  useEffect(() => setPrefs(loaded.data?.preferences ?? []), [loaded.data]);

  const change = (category: Preference['category'], patch: Partial<Preference>) => {
    setSaved(false);
    setPrefs((all) => all.map((pref) => (pref.category === category ? { ...pref, ...patch } : pref)));
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      loaded.setData(await api('/api/notification-preferences', { method: 'PUT', body: { preferences: prefs } }));
      setSaved(true);
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  if (loaded.problem) return <ErrorState problem={loaded.problem} onRetry={loaded.reload} />;
  if (!loaded.data) return <LoadingBlock />;
  return (
    <div className="page page-narrow">
      <BackLink to="/notifications">Notifications</BackLink>
      <PageHeader overline="Settings" title="Notification preferences" lede="Choose which in-app notices you get. Muting a conversation also stops its mention notices." />
      <Alert tone="info" title="Email digests are not sent yet">
        You can opt in now; nothing is emailed until digests are switched on for the club. Internal messages never send email by themselves.
      </Alert>
      <form className="stack" onSubmit={save}>
        {prefs.map((pref) => (
          <Card key={pref.category} title={CATEGORY[pref.category].title} description={CATEGORY[pref.category].description}>
            <div className="stack-sm">
              <label className="checkbox">
                <input type="checkbox" checked={pref.inApp} onChange={(event) => change(pref.category, { inApp: event.target.checked })} /> In-app notices
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={pref.emailDigest} onChange={(event) => change(pref.category, { emailDigest: event.target.checked })} /> Email digest
                (opt-in)
              </label>
              <div className="cluster">
                <TextField
                  label="Quiet from"
                  type="time"
                  optional
                  value={pref.quietStart ?? ''}
                  onChange={(event) => change(pref.category, { quietStart: event.target.value || null })}
                />
                <TextField
                  label="Quiet until"
                  type="time"
                  optional
                  value={pref.quietEnd ?? ''}
                  onChange={(event) => change(pref.category, { quietEnd: event.target.value || null })}
                />
              </div>
              <p className="caption muted">Quiet hours use India time and pause this category's notification badge. Unread notices stay in your inbox.</p>
            </div>
          </Card>
        ))}
        <ProblemAlert problem={problem} />
        {saved && <Alert tone="success" title="Preferences saved" />}
        <div>
          <Button type="submit" variant="primary" busy={busy}>
            Save preferences
          </Button>
        </div>
      </form>
    </div>
  );
}
