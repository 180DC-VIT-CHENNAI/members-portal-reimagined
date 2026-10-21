import { useState } from 'react';
import { Button, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { relativeTime } from '../../lib/format.ts';

/** Open message reports for holders of `chat.moderate`: dismiss, or remove the message. */
export function MessageReportsPage() {
  const reports = useLoad(() => api('/api/messages/reports'), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const resolve = async (id: number, action: 'dismiss' | 'remove') => {
    setBusy(`${action}-${id}`);
    setProblem(null);
    try {
      await api('/api/messages/reports/:id', { method: 'POST', params: { id: String(id) }, body: { action } });
      reports.reload();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page page-narrow">
      <PageHeader overline="Admin" title="Message reports" lede="Reported messages and the reason given. Removing a message erases its text and is recorded in the audit log." />
      <ProblemAlert problem={problem} />
      {reports.problem ? (
        <ErrorState problem={reports.problem} onRetry={reports.reload} />
      ) : !reports.data ? (
        <LoadingBlock />
      ) : reports.data.reports.length === 0 ? (
        <EmptyState icon="shield" title="No open reports" />
      ) : (
        <ul className="stack">
          {reports.data.reports.map((report) => (
            <li key={report.id} className="card">
              <div className="card-inner stack-sm">
                <p className="wrap-anywhere">{report.body ?? <span className="muted">Message already removed</span>}</p>
                <span className="caption muted">
                  By {report.authorName}
                  {report.context ? ` in ${report.context}` : ' in a direct message'} · reported by {report.reporterName} {relativeTime(report.createdAt)}
                </span>
                <p>
                  <strong>Reason:</strong> {report.reason}
                </p>
                <div className="cluster">
                  <Button size="sm" variant="danger" busy={busy === `remove-${report.id}`} onClick={() => resolve(report.id, 'remove')}>
                    Remove message
                  </Button>
                  <Button size="sm" busy={busy === `dismiss-${report.id}`} onClick={() => resolve(report.id, 'dismiss')}>
                    Dismiss
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
