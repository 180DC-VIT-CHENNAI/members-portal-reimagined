import { useState } from 'react';
import { useLoad } from '../../../lib/api.ts';
import { formatDateTime, relativeTime } from '../../../lib/format.ts';
import { github } from '../../../lib/github-client.ts';
import { deliveryPresentation } from '../../../lib/github-view.ts';
import { DELIVERY_STATUSES, type DeliveryRow, type DeliveryStatus } from '../../../server/github/types.ts';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, ProblemAlert, SelectField } from '../../ui.tsx';
import { ToneBadge } from '../parts.tsx';
import { useAction } from '../use-action.ts';

function DeliveryList({ status }: { status: DeliveryStatus | '' }) {
  const first = useLoad(() => github.deliveries(status ? { status } : {}), [status]);
  const [older, setOlder] = useState<DeliveryRow[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const more = useAction();

  if (!first.data) {
    return first.problem ? <ErrorState problem={first.problem} onRetry={first.reload} /> : <LoadingBlock rows={4} label="Loading deliveries" />;
  }
  const rows = [...first.data.deliveries, ...older];
  const next = cursor === undefined ? first.data.nextCursor : cursor;

  const loadOlder = async () => {
    if (next === null) return;
    const result = await more.run('older', () => github.deliveries(status ? { status, cursor: next } : { cursor: next }));
    if (!result.ok) return;
    setOlder((previous) => [...previous, ...result.value.deliveries]);
    setCursor(result.value.nextCursor);
  };

  if (rows.length === 0) {
    return (
      <EmptyState icon="inbox" title={status ? 'No deliveries with this status' : 'No deliveries yet'}>
        {status ? 'Try another status.' : 'GitHub has not sent the portal a webhook yet. Check the webhook secret and URL on the GitHub App.'}
      </EmptyState>
    );
  }
  return (
    <>
      <div className="table-wrap" aria-busy={first.loading || undefined}>
        <table className="table table-stack">
          <thead>
            <tr>
              <th scope="col">Received</th>
              <th scope="col">Event</th>
              <th scope="col">Status</th>
              <th scope="col">Attempts</th>
              <th scope="col">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((delivery) => (
              <tr key={delivery.id}>
                <td className="cell-primary" title={formatDateTime(delivery.receivedAt)}>
                  {relativeTime(delivery.receivedAt)}
                </td>
                <td data-label="Event">
                  {delivery.event}
                  {delivery.action ? `.${delivery.action}` : ''}
                </td>
                <td data-label="Status">
                  <ToneBadge presentation={deliveryPresentation(delivery.status)} />
                </td>
                <td data-label="Attempts">{delivery.attempts}</td>
                <td data-label="Detail" className="wrap-anywhere">
                  {delivery.detail ?? 'None'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="gha-pad">
        <div className="stack-sm">
          <ProblemAlert problem={more.problem} />
          {next !== null && (
            <div>
              <Button busy={more.busy === 'older'} onClick={() => void loadOlder()}>
                Show older deliveries
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function DeliveriesSection() {
  const [status, setStatus] = useState<DeliveryStatus | ''>('');
  return (
    <Card flush title="Webhook deliveries" description="What GitHub has sent the portal, newest first.">
      <div className="gha-pad">
        <form className="filters" role="search" aria-label="Filter deliveries" onSubmit={(event) => event.preventDefault()}>
          <SelectField label="Status" value={status} onChange={(event) => setStatus(DELIVERY_STATUSES.find((option) => option === event.target.value) ?? '')}>
            <option value="">All</option>
            {DELIVERY_STATUSES.map((option) => (
              <option key={option} value={option}>
                {deliveryPresentation(option).label}
              </option>
            ))}
          </SelectField>
        </form>
      </div>
      <DeliveryList key={status} status={status} />
    </Card>
  );
}
