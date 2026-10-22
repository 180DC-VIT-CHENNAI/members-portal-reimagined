import { Card, ErrorState, LoadingBlock } from '../../components/ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import { formatDate, STATUS_LABEL } from '../../lib/format.ts';

export function StatusHistoryCard({ personId, version }: { personId: string; version: string }) {
  const history = useLoad(() => api('/api/people/:id/status', { params: { id: personId } }), [personId, version]);
  return (
    <Card title="Status history" description="Every lifecycle change, with who made it and why." flush>
      {history.problem ? (
        <ErrorState problem={history.problem} onRetry={history.reload} />
      ) : !history.data ? (
        <LoadingBlock rows={2} />
      ) : (
        <div className="table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">Change</th>
                <th scope="col">Reason</th>
                <th scope="col">By</th>
              </tr>
            </thead>
            <tbody>
              {[...history.data].reverse().map((h) => (
                <tr key={h.id}>
                  <td className="nowrap">{formatDate(h.effectiveOn)}</td>
                  <td data-label="Change">{h.fromStatus ? `${STATUS_LABEL[h.fromStatus]} → ` : ''}{STATUS_LABEL[h.toStatus]}</td>
                  <td data-label="Reason">{h.reason ?? <span className="muted">None given</span>}</td>
                  <td data-label="By">{h.actorName ?? (h.actorPersonId ? 'Former member' : 'System')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
