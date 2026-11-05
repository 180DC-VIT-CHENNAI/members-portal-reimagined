import { type FormEvent, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, SearchField } from '../../components/ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import { Link } from '../../lib/router.tsx';
import type { InboxView } from '../../server/mailboxes/inbox-types.ts';

const views = [
  { id: 'inbox', label: 'Inbox', count: 'inbox' },
  { id: 'assigned', label: 'Assigned to me', count: 'assigned' },
  { id: 'unassigned', label: 'Unassigned', count: 'unassigned' },
  { id: 'archive', label: 'Archive', count: null },
] as const;

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function InboxCard({ id }: { readonly id: string }) {
  const [view, setView] = useState<InboxView>('inbox');
  const [draftQuery, setDraftQuery] = useState(''), [q, setQ] = useState('');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const before = cursors.at(-1);
  const counts = useLoad(() => api('/api/mailboxes/:id/counts', { params: { id } }), [id]);
  const load = useLoad(() => api('/api/mailboxes/:id/conversations', {
    params: { id }, query: { view, ...(view === 'search' ? { q } : {}), ...(before ? { before } : {}) },
  }), [id, view, q, before]);
  const choose = (next: InboxView) => { setView(next); setCursors([undefined]); };
  const search = (event: FormEvent) => {
    event.preventDefault();
    setQ(draftQuery.trim()); setCursors([undefined]); setView(draftQuery.trim() ? 'search' : 'inbox');
  };
  const nextBefore = load.data?.nextBefore;
  return <Card title="Conversations" actions={<Button onClick={() => { load.reload(); counts.reload(); }}>Refresh</Button>}>
    <div className="cluster" role="group" aria-label="Inbox views">
      {views.map((v) => {
        const n = v.count && counts.data ? counts.data[v.count] : 0;
        return <Button key={v.id} size="sm" aria-pressed={v.id === view} variant={v.id === view ? 'primary' : 'secondary'} onClick={() => choose(v.id)}>
          {v.label}{n > 0 ? ` (${n})` : ''}
        </Button>;
      })}
    </div>
    {counts.data && counts.data.overdue > 0 && <p className="muted"><span className="badge badge-warning">{counts.data.overdue} reply overdue</span> assigned to you.</p>}
    <form className="cluster" onSubmit={search} role="search">
      <SearchField label="Search this mailbox" value={draftQuery} onChange={(e) => setDraftQuery(e.target.value)} maxLength={200} />
      <Button type="submit">Search</Button>
    </form>
    {load.problem ? <ErrorState problem={load.problem} onRetry={load.reload} /> : !load.data || load.loading ? <LoadingBlock rows={3} /> :
      load.data.conversations.length === 0 ? <EmptyState icon="inbox" title={view === 'search' ? 'No matching conversations' : 'No conversations here'}>
        Incoming mail appears here once routing reaches this mailbox.
      </EmptyState> :
        <ul className="stack">{load.data.conversations.map((c) => <li key={c.id}>
          <Link to={`/mailboxes/${id}/conversations/${c.id}`}>{c.unread ? <strong>{c.subject}</strong> : c.subject}</Link>
          <p className="muted">
            {c.unread && <span className="badge badge-accent">Unread</span>} <span className="badge">{c.status}</span>
            {c.priority !== 'normal' && <> <span className={c.priority === 'urgent' || c.priority === 'high' ? 'badge badge-warning' : 'badge'}>{c.priority}</span></>}
            {' '}{c.assigneeName ? `Assigned to ${c.assigneeName}` : 'Unassigned'} · {when(c.lastMessageAt)}
            {c.dueForReplyAt && <> · reply due {when(c.dueForReplyAt)}</>}
            {c.tags.length > 0 && <> · {c.tags.join(', ')}</>}
          </p>
        </li>)}</ul>}
    <div className="cluster">
      {cursors.length > 1 && <Button onClick={() => setCursors((current) => current.slice(0, -1))}>Newer conversations</Button>}
      {nextBefore && <Button onClick={() => setCursors((current) => [...current, nextBefore])}>Older conversations</Button>}
    </div>
  </Card>;
}
