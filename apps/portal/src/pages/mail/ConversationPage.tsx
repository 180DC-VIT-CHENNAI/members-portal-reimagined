import { type FormEvent, useEffect, useState } from 'react';
import { MAIL_CHANGED } from '../../components/MailboxLink.tsx';
import { Alert, BackLink, Button, Card, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField, TextAreaField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { navigate } from '../../lib/router.tsx';
import { CONVERSATION_STATUSES, MAIL_PRIORITIES } from '../../server/mailboxes/inbox-types.ts';

type Detail = Awaited<ReturnType<typeof loadConversation>>;
type Message = Detail['messages'][number];
const loadConversation = (id: string, conversationId: string) =>
  api('/api/mailboxes/:id/conversations/:conversationId', { params: { id, conversationId } });
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const toLocalInput = (iso: string | null) => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '';

export function ConversationPage({ id, conversationId }: { readonly id: string; readonly conversationId: string }) {
  const load = useLoad(() => loadConversation(id, conversationId), [id, conversationId]);
  const mailbox = useLoad(() => api('/api/mailboxes/:id', { params: { id } }), [id]);
  useEffect(() => {
    if (!load.data) return;
    void api('/api/mailboxes/:id/conversations/:conversationId/read', { method: 'POST', params: { id, conversationId }, body: {} })
      .then(() => window.dispatchEvent(new Event(MAIL_CHANGED)), problemFrom);
  }, [id, conversationId, load.data]);
  const failure = load.problem ?? mailbox.problem;
  if (failure) return <div className="page"><ErrorState problem={failure} onRetry={() => { load.reload(); mailbox.reload(); }} /></div>;
  if (!load.data || !mailbox.data) return <LoadingBlock />;
  const detail = load.data, caps = detail.capabilities;
  const latestInbound = [...detail.messages].reverse().find((m) => m.direction === 'in');
  return <div className="page page-narrow">
    <BackLink to={`/mailboxes/${id}`}>{mailbox.data.mailbox.displayName}</BackLink>
    <PageHeader title={detail.conversation.subject} lede={`${detail.conversation.status} · ${detail.conversation.priority} priority`} />
    {detail.messages.map((m) => <MessageCard key={m.id} id={id} conversationId={conversationId} message={m} />)}
    {detail.nextBefore && <p className="muted">Showing the latest 50 messages.</p>}
    {caps.includes('mailbox.draft.create') && latestInbound && <ReplyButton id={id} conversationId={conversationId} messageId={latestInbound.id} />}
    {caps.includes('mailbox.assign') && <Triage id={id} detail={detail} onChanged={load.reload} />}
    <Notes id={id} conversationId={conversationId} detail={detail} onChanged={load.reload}
      canWrite={caps.includes('mailbox.assign') || caps.includes('mailbox.draft.create')} />
  </div>;
}

function MessageCard({ id, conversationId, message }: { readonly id: string; readonly conversationId: string; readonly message: Message }) {
  const [remote, setRemote] = useState(false);
  const body = useLoad(() => message.hasHtml
    ? api('/api/mailboxes/:id/conversations/:conversationId/messages/:messageId/body', { params: { id, conversationId, messageId: message.id }, query: remote ? { remote: '1' } : {} })
    : Promise.resolve(null), [id, conversationId, message.id, message.hasHtml, remote]);
  const from = message.from.name ? `${message.from.name} <${message.from.address}>` : message.from.address;
  return <Card title={message.direction === 'in' ? from : `Sent from ${message.from.address}`}
    description={`${when(message.receivedAt)} · to ${message.to.map((t) => t.address).join(', ')}${message.cc.length ? ` · cc ${message.cc.map((t) => t.address).join(', ')}` : ''}`}>
    {message.direction === 'in' && <p className="muted">The sender address is not verified proof of identity.{message.authSignals ? '' : ' No authentication results were recorded.'}</p>}
    {message.direction === 'out' && <p className="muted">{message.status === 'accepted' ? 'Accepted by the provider. This does not confirm inbox delivery.' : 'Sending outcome unknown. Do not resend.'}</p>}
    {body.data?.document ? <>
      <iframe className="mail-frame" title={`Message from ${message.from.address}`} sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer" srcDoc={body.data.document} />
      {body.data.remoteBlocked && !remote && <div className="cluster"><span className="muted">Remote images are blocked.</span>
        <Button size="sm" onClick={() => setRemote(true)}>Load remote images</Button></div>}
    </> : <pre className="mail-text">{message.text || '(No text content)'}</pre>}
    {body.problem && <ErrorState problem={body.problem} onRetry={body.reload} />}
    {message.attachments.length > 0 && <ul className="stack-sm">{message.attachments.map((a) => <li key={a.id}>
      {a.quarantineStatus === 'allowed'
        ? <a href={`/api/mailboxes/${id}/conversations/${conversationId}/attachments/${a.id}`}>{a.filename}</a>
        : <span>{a.filename} <span className="badge badge-warning">blocked</span></span>}
      <span className="muted"> ({Math.ceil(a.size / 1024)} KiB, {a.mime})</span>
    </li>)}</ul>}
  </Card>;
}

function ReplyButton({ id, conversationId, messageId }: { readonly id: string; readonly conversationId: string; readonly messageId: string }) {
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null);
  const reply = async () => {
    setBusy(true); setProblem(null);
    try {
      const draft: { id: string } = await api('/api/mailboxes/:id/conversations/:conversationId/reply', { method: 'POST', params: { id, conversationId }, body: { messageId } });
      navigate(`/mailboxes/${id}/drafts/${draft.id}`);
    } catch (error) { setProblem(problemFrom(error)); setBusy(false); }
  };
  return <div className="stack-sm"><ProblemAlert problem={problem} />
    <Button variant="primary" busy={busy} onClick={reply}>Draft a reply for review</Button></div>;
}

function Triage({ id, detail, onChanged }: { readonly id: string; readonly detail: Detail; readonly onChanged: () => void }) {
  const c = detail.conversation;
  const people = useLoad(() => api('/api/mailboxes/:id/assignees', { params: { id } }), [id]);
  const [status, setStatus] = useState(c.status), [priority, setPriority] = useState(c.priority);
  const [assignedTo, setAssignee] = useState(c.assignedTo ?? ''), [tags, setTags] = useState(c.tags.join(', '));
  const [due, setDue] = useState(toLocalInput(c.dueForReplyAt));
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null), [saved, setSaved] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setProblem(null); setSaved(false);
    try {
      await api('/api/mailboxes/:id/conversations/:conversationId', { method: 'PATCH', params: { id, conversationId: c.id }, body: {
        status, priority, assignedTo: assignedTo || null, dueForReplyAt: due ? new Date(due).toISOString() : null,
        tags: [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))],
      } });
      setSaved(true); onChanged();
    } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  return <Card title="Assignment and status" description="Only members who can read this mailbox can be assigned.">
    <form className="form" onSubmit={save}>
      <SelectField label="Assigned to" value={assignedTo} onChange={(e) => setAssignee(e.target.value)}>
        <option value="">Unassigned</option>
        {people.data?.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </SelectField>
      <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
        {CONVERSATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </SelectField>
      <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
        {MAIL_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </SelectField>
      <TextField label="Tags" optional hint="Comma separated, up to 10" value={tags} onChange={(e) => setTags(e.target.value)} />
      <TextField label="Reply due" optional type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
      <ProblemAlert problem={problem ?? people.problem} />
      {saved && <Alert tone="success">Saved.</Alert>}
      <Button type="submit" busy={busy}>Save</Button>
    </form>
  </Card>;
}

function Notes({ id, conversationId, detail, canWrite, onChanged }: {
  readonly id: string; readonly conversationId: string; readonly detail: Detail; readonly canWrite: boolean; readonly onChanged: () => void;
}) {
  const [body, setBody] = useState(''), [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null);
  const add = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setProblem(null);
    try {
      await api('/api/mailboxes/:id/conversations/:conversationId/notes', { method: 'POST', params: { id, conversationId }, body: { body } });
      setBody(''); onChanged();
    } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  return <Card title="Internal notes" description="Visible to members of this mailbox only. Never sent to the sender.">
    <ul className="stack">{detail.notes.map((n) => <li key={n.id}><p>{n.body}</p><p className="muted">{n.author} · {when(n.createdAt)}</p></li>)}</ul>
    {detail.notes.length === 0 && <p className="muted">No notes yet.</p>}
    {canWrite && <form className="form" onSubmit={add}>
      <TextAreaField label="Add a note" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} required />
      <ProblemAlert problem={problem} />
      <Button type="submit" busy={busy} disabled={!body.trim()}>Add note</Button>
    </form>}
  </Card>;
}
