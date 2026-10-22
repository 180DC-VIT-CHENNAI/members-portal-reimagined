import { useState } from 'react';
import { Alert, BackLink, Button, Card, ErrorState, LoadingBlock, PageHeader, ProblemAlert, TextAreaField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { Link } from '../../lib/router.tsx';
import { useSession } from '../../lib/session.tsx';
import { DraftEditor } from './DraftEditor.tsx';
import { TemplateCompose } from './TemplateCompose.tsx';

export function DraftPage({ id, draftId, edit = false }: { readonly id: string; readonly draftId?: string; readonly edit?: boolean }) {
  const load = useLoad(() => draftId ? api('/api/mailboxes/:id/drafts/:draftId', { params: { id, draftId } }) : Promise.resolve(null), [id, draftId]);
  const mailbox = useLoad(() => api('/api/mailboxes/:id', { params: { id } }), [id]);
  const { me } = useSession();
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null);
  const [comments, setComments] = useState(''), [scheduledAt, setSchedule] = useState('');
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setProblem(null);
    try { await action(); load.reload(); } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  const failure = load.problem ?? mailbox.problem;
  if (failure) return <div className="page"><ErrorState problem={failure} onRetry={() => { load.reload(); mailbox.reload(); }} /></div>;
  if (load.data === undefined || !mailbox.data || load.loading) return <LoadingBlock />;
  const loaded = load.data;
  const caps = mailbox.data.capabilities;
  if (!loaded) return <div className="page page-narrow">
    <BackLink to={`/mailboxes/${id}`}>{mailbox.data.mailbox.displayName}</BackLink>
    <PageHeader title="New draft" lede={mailbox.data.mailbox.address} />
    {caps.includes('mailbox.draft.create') ? <><TemplateCompose id={id} /><DraftEditor id={id} /></> : <Alert tone="warning">You have no drafting access.</Alert>}
  </div>;
  const { draft, snapshot } = loaded;
  const mayEdit = caps.includes('mailbox.draft.edit_any') || (caps.includes('mailbox.draft.edit_own') && draft.createdBy === me.id);
  const editable = ['draft', 'submitted', 'changes_requested', 'approved', 'scheduled', 'queued'].includes(draft.state);
  if (edit && mayEdit && editable) return <div className="page page-narrow"><BackLink to={`/mailboxes/${id}/drafts/${draft.id}`}>Back to review</BackLink><DraftEditor key={snapshot.id} id={id} existing={loaded} /></div>;
  const params = { id, draftId: draft.id };
  const review = (decision: 'approved' | 'changes_requested' | 'rejected') =>
    run(() => api('/api/mailboxes/:id/drafts/:draftId/:action', { method: 'POST', params: { ...params, action: 'review' }, body: { revision: draft.revision, decision, comments } }));
  return <div className="page page-narrow">
    <BackLink to={`/mailboxes/${id}`}>{mailbox.data.mailbox.displayName}</BackLink>
    <PageHeader title={snapshot.subject} lede={`Revision ${draft.revision} · ${draft.state.replaceAll('_', ' ')}`} />
    <ProblemAlert problem={problem} />
    {draft.state === 'outcome_unknown' && <Alert tone="warning" title="Sending outcome is unknown">Do not resend. An operator must reconcile the provider record first.</Alert>}
    {draft.state === 'accepted' && <Alert tone="success" title="Accepted by the provider">This does not confirm delivery to the recipient's inbox.</Alert>}
    <Card title="Exact reviewed content">
      <dl className="stack-sm">
        <div><dt>From</dt><dd>{snapshot.fromName} &lt;{snapshot.fromAddress}&gt;</dd></div>
        <div><dt>To</dt><dd>{snapshot.recipients.to.join(', ')}</dd></div>
        <div><dt>CC</dt><dd>{snapshot.recipients.cc.join(', ') || 'None'}</dd></div>
        <div><dt>BCC</dt><dd>{snapshot.recipients.bcc.join(', ') || 'None'}</dd></div>
        {snapshot.templateVersionId && <div><dt>Template</dt><dd>Pinned to template version <code>{snapshot.templateVersionId.slice(0, 8)}</code></dd></div>}
      </dl>
      <TextAreaField label="Frozen message" value={snapshot.text} readOnly rows={10} />
      {snapshot.signature && <TextAreaField label="Signature" value={snapshot.signature} readOnly />}
      <ul>{snapshot.attachments.map((a) => <li key={a.id}><a href={`/api/mailboxes/${id}/attachments/${a.id}`}>{a.filename}</a> ({Math.ceil(a.bytes / 1024)} KiB)</li>)}</ul>
      {mayEdit && editable && <Link className="btn btn-secondary" to={`/mailboxes/${id}/drafts/${draft.id}/edit`}>Edit and invalidate approval</Link>}
      {caps.includes('mailbox.draft.submit') && ['draft', 'changes_requested'].includes(draft.state) && <Button variant="primary" busy={busy} onClick={() => run(() =>
        api('/api/mailboxes/:id/drafts/:draftId/:action', { method: 'POST', params: { ...params, action: 'submit' }, body: { revision: draft.revision } }))}>Submit for review</Button>}
    </Card>
    {caps.includes('mailbox.review') && draft.state === 'submitted' && <Card title="Review this revision">
      <TextAreaField label="Review comments" value={comments} onChange={(e) => setComments(e.target.value)} maxLength={2000} />
      <div className="cluster">
        {caps.includes('mailbox.approve') && caps.includes('mailbox.send') && <Button busy={busy} variant="primary" onClick={() => review('approved')}>Approve this revision</Button>}
        <Button busy={busy} onClick={() => review('changes_requested')}>Request changes</Button>
        <Button busy={busy} variant="danger-quiet" onClick={() => review('rejected')}>Reject revision</Button>
      </div>
    </Card>}
    {caps.includes('mailbox.send') && draft.state === 'approved' && <Card title="Dispatch approved revision" description="Permissions, mailbox policy and the approved snapshot are checked again immediately before dispatch.">
      <TextField label="Schedule" optional type="datetime-local" value={scheduledAt} onChange={(e) => setSchedule(e.target.value)} />
      <Button busy={busy} variant="primary" onClick={() => run(() => api('/api/mailboxes/:id/drafts/:draftId/:action', { method: 'POST', params: { ...params, action: 'send' },
        body: { revision: draft.revision, idempotencyKey: crypto.randomUUID(), scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null } }))}>
        {scheduledAt ? 'Schedule approved message' : 'Queue approved message'}
      </Button>
    </Card>}
    <Card title="Review history"><ul className="stack">{loaded.reviews.map((entry) => <li key={entry.id}>{entry.decision.replaceAll('_', ' ')}{entry.comments && <p>{entry.comments}</p>}</li>)}</ul></Card>
  </div>;
}
