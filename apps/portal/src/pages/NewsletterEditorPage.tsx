import { useState } from 'react';
import { Alert, BackLink, Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert } from '../components/ui.tsx';
import { api, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { formatDate } from '../lib/format.ts';
import { loadIssues, type IssueSummary } from '../lib/newsletter-client.ts';
import { Link, navigate } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';

type Confirmation = { readonly kind: 'broadcast' | 'delete'; readonly issue: IssueSummary };
export function NewsletterEditorPage() {
  const { can, me } = useSession();
  const issues = useLoad(loadIssues, []);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [notice, setNotice] = useState('');
  const action = async (issue: IssueSummary, kind: 'test' | 'broadcast' | 'delete') => {
    setBusy(true); setProblem(null); setNotice('');
    try {
      switch (kind) {
        case 'test': await api('/api/newsletter/issues/:id/test', { method: 'POST', params: { id: issue.id } }); setNotice(`Test queued to ${me.email}.`); break;
        case 'broadcast': { const result = await api('/api/newsletter/issues/:id/send', { method: 'POST', params: { id: issue.id } }); setNotice(`Queued for ${result.queued} confirmed readers. Follow delivery progress in the email queue.`); break; }
        case 'delete': await api('/api/newsletter/issues/:id', { method: 'DELETE', params: { id: issue.id } }); break;
        default: { const unhandled: never = kind; return unhandled; }
      }
      setConfirm(null); issues.reload();
    } catch (err) { setProblem(problemFrom(err)); } finally { setBusy(false); }
  };
  const ask = (kind: Confirmation['kind'], issue: IssueSummary) => { setProblem(null); setConfirm({ kind, issue }); };
  return <div className="page"><BackLink to="/admin">Admin</BackLink>
    <PageHeader overline="The Catalyst" title="Newsletter editor" lede="Write your own drafts, or collaborate on shared ones. Tests go only to your Google email."
      actions={<div className="cluster"><Button onClick={() => navigate('/newsletter-editor/events')}>Event email</Button><Button variant="primary" icon="plus" onClick={() => navigate('/newsletter-editor/new')}>New issue</Button></div>} />
    <div className="stack">
      {notice && <Alert tone="success">{notice}</Alert>}
      {can('newsletter.manage', null) && <div className="cluster"><Link to="/admin/newsletter-subscribers">Manage subscribers</Link><Link to="/admin/email-queue">Email queue</Link><Link to="/newsletter">Public archive</Link></div>}
      <ProblemAlert problem={confirm ? null : problem} />
      {issues.problem ? <ErrorState problem={issues.problem} onRetry={issues.reload} /> : !issues.data ? <LoadingBlock /> : !issues.data.length ? <EmptyState icon="inbox" title="Your first issue starts here" action={<Button onClick={() => navigate('/newsletter-editor/new')}>New issue</Button>}>Drafts stay private until a broadcast completes with at least one accepted message.</EmptyState> :
        <Card flush><div className="table-wrap"><table className="table table-stack"><thead><tr><th>Issue</th><th>Status</th><th>Actions</th></tr></thead><tbody>{issues.data.map((issue) => <tr key={issue.id}>
          <td className="cell-primary"><Link to={`/newsletter-editor/${issue.id}`}>{issue.title}</Link><div className="caption muted">{issue.slug}{issue.shared ? ' · Shared draft' : ''}</div></td>
          <td data-label="Status">{issue.broadcastId ? 'Queued / sending' : issue.sentAt ? `Sent ${formatDate(issue.sentAt)} · ${issue.recipientCount} accepted` : 'Draft'}</td>
          <td data-label="Actions"><div className="cluster"><Button size="sm" disabled={busy} onClick={() => navigate(`/newsletter-editor/${issue.id}`)}>Edit</Button><Button size="sm" disabled={busy} onClick={() => void action(issue, 'test')}>Test to me</Button>
            {issue.access.send && !issue.sentAt && !issue.broadcastId && <Button size="sm" variant="primary" disabled={busy} onClick={() => ask('broadcast', issue)}>Broadcast</Button>}
            {issue.sentAt && <Link to={`/newsletter/${issue.slug}`}>Read</Link>}
            {issue.access.remove && !issue.broadcastId && <Button size="sm" variant="danger-quiet" disabled={busy} onClick={() => ask('delete', issue)}>Delete</Button>}
          </div></td>
        </tr>)}</tbody></table></div></Card>}
    </div>
    <ConfirmDialog open={confirm !== null} title={confirm?.kind === 'broadcast' ? 'Broadcast this issue?' : 'Delete this issue?'} confirmLabel={confirm?.kind === 'broadcast' ? 'Queue broadcast' : 'Delete issue'} tone={confirm?.kind === 'delete' ? 'danger' : 'primary'} busy={busy} problem={problem}
      onConfirm={() => { if (confirm) void action(confirm.issue, confirm.kind); }} onClose={() => setConfirm(null)}>
      <p>{confirm?.kind === 'broadcast' ? `"${confirm.issue.title}" will be queued for every confirmed subscriber. Test it first; a broadcast cannot be recalled.` : 'The issue disappears from the editor and public archive. Previously sent mail is unchanged.'}</p>
    </ConfirmDialog>
  </div>;
}
