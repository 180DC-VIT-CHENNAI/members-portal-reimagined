import { useState } from 'react';
import { BackLink, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDateTime } from '../../lib/format.ts';
import { useSession } from '../../lib/session.tsx';
import { Forbidden } from './Forbidden.tsx';

export function EmailQueuePage() {
  const { can } = useSession();
  if (!can('email.view', null)) return <Forbidden title="Email queue" />;
  return <Queue />;
}

function Queue() {
  const list = useLoad(() => api('/api/admin/email-queue'), []);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="page">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader overline="Communications" title="Email queue" lede="Campaign progress and SMTP acceptance. Acceptance does not guarantee inbox delivery." />
      {list.problem ? <ErrorState problem={list.problem} onRetry={list.reload} /> : !list.data ? <LoadingBlock /> : (
        <>
          <Card title="Hourly allowance" actions={<Button onClick={list.reload}>Refresh</Button>}>
            <p><strong>{list.data.hourlyCount} / {list.data.hourlyLimit}</strong> messages accepted this UTC hour.</p>
            <p className="muted">Campaigns use up to 90% of the allowance, leaving capacity for direct mail.</p>
            <div className="cluster">
              {list.data.counts.map((entry) => <span key={entry.status} className="badge">{entry.count} {entry.status}</span>)}
            </div>
          </Card>
          <Card title="Recent campaigns" description="The ten newest campaigns." flush>
            {list.data.recent.length === 0 ? <EmptyState icon="inbox" title="No campaigns yet" /> : (
              <div className="table-wrap">
                <table className="table table-stack">
                  <thead><tr><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Progress</th><th scope="col">Created</th><th scope="col">Details</th></tr></thead>
                  <tbody>
                    {list.data.recent.map((campaign) => (
                      <tr key={campaign.id}>
                        <td className="cell-primary">{campaign.subject}<div className="caption muted">{campaign.kind}</div></td>
                        <td data-label="Status"><span className="badge">{campaign.status}</span></td>
                        <td data-label="Progress">{campaign.sent} accepted · {campaign.failed} failed / {campaign.total}</td>
                        <td data-label="Created">{formatDateTime(campaign.createdAt)}</td>
                        <td data-label="Details"><Button size="sm" onClick={() => setSelected(campaign.id)}>View deliveries</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          {selected && <Deliveries key={selected} id={selected} onClose={() => setSelected(null)} onRetried={list.reload} />}
        </>
      )}
    </div>
  );
}

function Deliveries({ id, onClose, onRetried }: { id: string; onClose: () => void; onRetried: () => void }) {
  const { can } = useSession();
  const load = useLoad(() => api('/api/admin/email-queue/:id/deliveries', { params: { id } }), [id]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const retry = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/admin/email-queue/:id/retry-failed', { method: 'POST', params: { id } });
      load.reload();
      onRetried();
    } catch (error) { setProblem(problemFrom(error)); }
    finally { setBusy(false); }
  };
  const campaign = load.data?.campaign;
  return (
    <Card title={campaign ? `Deliveries: ${campaign.subject}` : 'Deliveries'} actions={<Button onClick={onClose}>Close details</Button>}>
      <ProblemAlert problem={problem} />
      {load.problem ? <ErrorState problem={load.problem} onRetry={load.reload} /> : !load.data ? <LoadingBlock /> : (
        <>
          {campaign?.lastError && <p className="pre-wrap">{campaign.lastError}</p>}
          {can('email.manage', null) && campaign && (campaign.status === 'done' || campaign.status === 'failed') &&
            (campaign.failed > 0 || campaign.status === 'failed') && (
              <Button busy={busy} onClick={retry}>Retry failed recipients</Button>
            )}
          {load.data.deliveries.length === 0 ? <EmptyState icon="inbox" title="No recipient results yet" /> : (
            <div className="table-wrap">
              <table className="table table-stack">
                <thead><tr><th scope="col">Recipient</th><th scope="col">Result</th><th scope="col">Attempts</th><th scope="col">Error</th></tr></thead>
                <tbody>{load.data.deliveries.map((delivery) => (
                  <tr key={delivery.recipient}>
                    <td className="cell-primary">{delivery.recipient}</td>
                    <td data-label="Result">{delivery.status === 'sent' ? 'Accepted' : delivery.status}</td>
                    <td data-label="Attempts">{delivery.attempts}</td>
                    <td data-label="Error">{delivery.error ?? 'None'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
