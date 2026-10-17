import { useState } from 'react';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, PageHeader, SearchField, SelectField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDate } from '../../lib/format.ts';

const loadSubscribers = () => api('/api/newsletter/subscribers');
type Subscriber = Awaited<ReturnType<typeof loadSubscribers>>[number];
const STATUS_LABEL = { pending: 'Pending confirmation', active: 'Subscribed', unsubscribed: 'Unsubscribed' } as const;

export function NewsletterSubscribersPage() {
  const subscribers = useLoad(loadSubscribers, []);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [erasing, setErasing] = useState<Subscriber | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const rows = subscribers.data ?? [];
  const needle = query.trim().toLowerCase();
  const shown = rows.filter((s) => (!status || s.status === status) && (!needle || `${s.email} ${s.name ?? ''}`.toLowerCase().includes(needle)));
  const erase = async () => {
    if (!erasing) return;
    setBusy(true); setProblem(null);
    try { await api('/api/newsletter/subscribers/:id', { method: 'DELETE', params: { id: erasing.id } }); setErasing(null); subscribers.reload(); }
    catch (err) { setProblem(problemFrom(err)); } finally { setBusy(false); }
  };
  return <div className="page">
    <PageHeader overline="Newsletter" title="Subscribers" lede="Email-only readers of The Catalyst. Pending addresses do not receive broadcasts." />
    <div className="stack">
      <div className="cluster">{Object.entries(STATUS_LABEL).map(([value, label]) => <span key={value} className="badge">{label}: {rows.filter((s) => s.status === value).length}</span>)}</div>
      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <SearchField label="Search" placeholder="Email or name" value={query} onChange={(e) => setQuery(e.target.value)} />
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Everyone</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      </form>
      {subscribers.problem ? <ErrorState problem={subscribers.problem} onRetry={subscribers.reload} /> : !subscribers.data ? <LoadingBlock /> : !shown.length ? <EmptyState icon="inbox" title={rows.length ? 'Nobody matches' : 'No subscribers yet'} /> :
        <Card flush><div className="table-wrap"><table className="table table-stack"><thead><tr><th>Email</th><th>Name</th><th>Status</th><th>Confirmed</th><th>Actions</th></tr></thead><tbody>{shown.map((s) => <tr key={s.id}>
          <td className="cell-primary">{s.email}</td><td data-label="Name">{s.name ?? '—'}</td><td data-label="Status"><span className={s.status === 'active' ? 'badge badge-success' : 'badge'}>{STATUS_LABEL[s.status]}</span></td><td data-label="Confirmed">{formatDate(s.confirmedAt) || '—'}</td>
          <td data-label="Actions"><Button size="sm" variant="danger-quiet" icon="trash" onClick={() => { setProblem(null); setErasing(s); }}>Erase</Button></td>
        </tr>)}</tbody></table></div></Card>}
    </div>
    <ConfirmDialog open={erasing !== null} title="Erase this subscription?" confirmLabel="Erase subscription" tone="danger" busy={busy} problem={problem} onConfirm={() => void erase()} onClose={() => setErasing(null)}>
      <p>{erasing?.email} and their subscription credentials will be permanently removed. This doesn't remove a member account.</p>
    </ConfirmDialog>
  </div>;
}
