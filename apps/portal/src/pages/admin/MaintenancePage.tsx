import { useEffect, useState } from 'react';
import { Alert, BackLink, Button, Card, ErrorState, LoadingBlock, PageHeader, ProblemAlert, TextAreaField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { useSession } from '../../lib/session.tsx';
import { Forbidden } from './Forbidden.tsx';

export function MaintenancePage() {
  const { can } = useSession();
  const state = useLoad(() => api('/api/admin/maintenance'), []);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  useEffect(() => {
    if (state.data) setMessage(state.data.message);
  }, [state.data]);
  if (!can('site.maintenance')) return <Forbidden title="Maintenance" />;

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      state.setData(await api('/api/admin/maintenance', { method: 'POST', body: { enabled, message: message || null } }));
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-narrow">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader overline="Site" title="Maintenance mode" lede="While it's on, everyone without the maintenance permission gets a maintenance notice instead of the portal. The public site stays up." />
      {state.problem ? (
        <ErrorState problem={state.problem} onRetry={state.reload} />
      ) : !state.data ? (
        <LoadingBlock rows={3} />
      ) : (
        <Card>
          <div className="form">
            {state.data.enabled ? (
              <Alert tone="warning" title="Maintenance mode is on">
                Members can't use the portal right now.
              </Alert>
            ) : (
              <Alert tone="success" title="The portal is open to everyone" />
            )}
            <TextAreaField label="Message shown to visitors" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500} />
            <ProblemAlert problem={problem} />
            <div className="form-actions">
              {state.data.enabled ? (
                <Button variant="primary" busy={busy} onClick={() => toggle(false)}>
                  Turn off
                </Button>
              ) : (
                <Button variant="danger" icon="wrench" busy={busy} onClick={() => toggle(true)}>
                  Turn on
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
