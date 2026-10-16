import { useEffect, useState } from 'react';
import { BackLink, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from '../../components/ui.tsx';
import { api, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDateTime, relativeTime } from '../../lib/format.ts';
import { Link } from '../../lib/router.tsx';
import { useSession } from '../../lib/session.tsx';
import type { AuditEntry } from '../../lib/types.ts';
import { Forbidden } from './Forbidden.tsx';

const PAGE = 100;

export function AuditPage() {
  const { can } = useSession();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const load = async (before?: number) => {
    setBusy(true);
    setProblem(null);
    try {
      const page = await api('/api/audit', { query: before ? { before: String(before) } : {} });
      setEntries((prev) => (before && prev ? [...prev, ...page] : page));
      setMore(page.length === PAGE);
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (can('audit.view')) void load();
  }, []);
  if (!can('audit.view')) return <Forbidden title="Audit log" />;

  return (
    <div className="page">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader overline="Access" title="Audit log" lede="Every administrative change, newest first." />
      <Card flush>
        {problem && !entries ? (
          <ErrorState problem={problem} onRetry={() => void load()} />
        ) : !entries ? (
          <LoadingBlock />
        ) : entries.length === 0 ? (
          <EmptyState icon="fileText" title="Nothing recorded yet" />
        ) : (
          <div className="table-wrap">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Action</th>
                  <th scope="col">Target</th>
                  <th scope="col">By</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap" data-label="When">
                      <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>
                        {relativeTime(e.createdAt)}
                      </time>
                    </td>
                    <td className="cell-primary mono">{e.action}</td>
                    <td data-label="Target">
                      {e.targetType === 'person' && e.targetId ? (
                        <Link className="text-link" to={`/people/${e.targetId}`}>
                          Person
                        </Link>
                      ) : (
                        <span>
                          {e.targetType}
                          {e.targetId ? <span className="mono muted"> {e.targetId}</span> : null}
                        </span>
                      )}
                    </td>
                    <td data-label="By">
                      {e.actorPersonId ? (
                        <Link className="text-link" to={`/people/${e.actorPersonId}`}>
                          View
                        </Link>
                      ) : (
                        <span className="muted">System</span>
                      )}
                    </td>
                    <td data-label="Details">
                      {e.details && Object.keys(e.details).length > 0 ? (
                        <details className="audit-details">
                          <summary>Show</summary>
                          <pre>{JSON.stringify(e.details, null, 2)}</pre>
                        </details>
                      ) : (
                        <span className="muted">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {more && entries && (
          <div className="card-foot">
            <Button busy={busy} onClick={() => void load(entries[entries.length - 1].id)}>
              Load older entries
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
