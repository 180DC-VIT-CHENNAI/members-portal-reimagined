import { useState } from 'react';
import { BackLink, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from '../../components/ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import { Link } from '../../lib/router.tsx';
import { MailboxManagement } from './MailboxManagement.tsx';
import { FollowUps } from './TemplateCompose.tsx';
import type { MailFolder } from '../../server/mailboxes/types.ts';

const folders = [
  { id: 'drafts', label: 'Drafts', states: ['draft', 'changes_requested', 'submitted', 'approved'] },
  { id: 'review', label: 'Needs approval', states: ['submitted'] },
  { id: 'scheduled', label: 'Scheduled', states: ['scheduled', 'queued', 'sending'] },
  { id: 'sent', label: 'Sent', states: ['accepted'] },
  { id: 'failed', label: 'Needs attention', states: ['failed', 'outcome_unknown', 'cancelled', 'rejected'] },
] as const;
const loadDrafts = (id: string, folder: MailFolder, before?: string) =>
  api('/api/mailboxes/:id/drafts', { params: { id }, query: { folder, ...(before ? { before } : {}) } });

export function MailboxPage({ id }: { readonly id: string }) {
  const load = useLoad(() => api('/api/mailboxes/:id', { params: { id } }), [id]);
  if (load.problem) return <div className="page"><ErrorState problem={load.problem} onRetry={load.reload} /></div>;
  if (!load.data || load.loading) return <LoadingBlock />;
  const access = load.data;
  return <div className="page page-narrow">
    <BackLink to="/mailboxes">Shared mailboxes</BackLink>
    <PageHeader title={access.mailbox.displayName} lede={access.mailbox.address} actions={
      access.capabilities.includes('mailbox.draft.create') && access.mailbox.status === 'active' ?
        <Link className="btn btn-primary" to={`/mailboxes/${id}/compose`}>New draft</Link> : undefined
    } />
    <p className="muted">Sending {access.mailbox.outboundPaused ? 'paused' : access.mailbox.outboundAdapter === 'disabled' ? 'not enabled' : 'requires a current approval'}. Acceptance is not confirmed inbox delivery.</p>
    {access.capabilities.includes('mailbox.draft.create') && <FollowUps id={id} />}
    {access.capabilities.includes('mailbox.read') && <DraftFolders id={id} />}
    {access.capabilities.includes('mailbox.manage') && <MailboxManagement id={id} mailbox={access.mailbox} onChanged={load.reload} />}
    {access.capabilities.includes('mailbox.audit') && <Audit id={id} />}
  </div>;
}

function DraftFolders({ id }: { readonly id: string }) {
  const [folder, setFolder] = useState<MailFolder>('drafts');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const before = cursors.at(-1);
  const load = useLoad(() => loadDrafts(id, folder, before), [id, folder, before]);
  if (load.problem) return <ErrorState problem={load.problem} onRetry={load.reload} />;
  if (!load.data || load.loading) return <LoadingBlock />;
  const items = load.data.drafts;
  const nextBefore = load.data.nextBefore;
  return <Card title="Messages" actions={<Button onClick={load.reload}>Refresh</Button>}>
    <div className="cluster" role="group" aria-label="Draft folders">
      {folders.map((f) => <Button key={f.id} size="sm" aria-pressed={f.id === folder} variant={f.id === folder ? 'primary' : 'secondary'} onClick={() => { setFolder(f.id); setCursors([undefined]); }}>{f.label}</Button>)}
    </div>
    <ul className="stack">{items.map(({ draft, subject }) =>
      <li key={draft.id}><Link to={`/mailboxes/${id}/drafts/${draft.id}`}>{subject}</Link><p className="muted">Revision {draft.revision} · {draft.state.replaceAll('_', ' ')}</p></li>)}</ul>
    {items.length === 0 && <EmptyState icon="inbox" title="Nothing in this folder">Choose another folder or create a draft if you have drafting access.</EmptyState>}
    <div className="cluster">
      {cursors.length > 1 && <Button onClick={() => setCursors((current) => current.slice(0, -1))}>Newer messages</Button>}
      {nextBefore && <Button onClick={() => setCursors((current) => [...current, nextBefore])}>Older messages</Button>}
    </div>
  </Card>;
}

function Audit({ id }: { readonly id: string }) {
  const load = useLoad(() => api('/api/mailboxes/:id/audit', { params: { id } }), [id]);
  return <Card title="Access and action history">
    {load.problem ? <ErrorState problem={load.problem} onRetry={load.reload} /> : !load.data ? <LoadingBlock /> :
      <ul className="stack">{load.data.audit.map((entry) => <li key={entry.id}>{entry.action.replaceAll('.', ' ')}<span className="muted"> — {new Date(entry.createdAt.replace(' ', 'T') + 'Z').toLocaleString()}</span></li>)}</ul>}
  </Card>;
}
