import { type FormEvent, useState } from 'react';
import { Button, Card, ProblemAlert, TextAreaField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, upload } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { navigate } from '../../lib/router.tsx';

const loadDraft = (id: string, draftId: string) => api('/api/mailboxes/:id/drafts/:draftId', { params: { id, draftId } });
type Existing = Awaited<ReturnType<typeof loadDraft>>;
const splitAddresses = (value: string) => value.split(/[,;\s]+/).filter(Boolean);

export function DraftEditor({ id, existing }: { readonly id: string; readonly existing?: Existing }) {
  const [to, setTo] = useState(existing?.snapshot.recipients.to.join(', ') ?? '');
  const [cc, setCc] = useState(existing?.snapshot.recipients.cc.join(', ') ?? '');
  const [bcc, setBcc] = useState(existing?.snapshot.recipients.bcc.join(', ') ?? '');
  const [subject, setSubject] = useState(existing?.snapshot.subject ?? ''), [text, setText] = useState(existing?.snapshot.text ?? '');
  const [attachments, setAttachments] = useState<readonly { readonly id: string; readonly filename: string }[]>(existing?.snapshot.attachments ?? []);
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setProblem(null);
    const body = { to: splitAddresses(to), cc: splitAddresses(cc), bcc: splitAddresses(bcc), subject, text, attachmentIds: attachments.map((a) => a.id) };
    try {
      if (existing) {
        await api('/api/mailboxes/:id/drafts/:draftId', { method: 'PATCH', params: { id, draftId: existing.draft.id }, body: { ...body, revision: existing.draft.revision } });
        navigate(`/mailboxes/${id}/drafts/${existing.draft.id}`);
      } else {
        const created: { id: string } = await api('/api/mailboxes/:id/drafts', { method: 'POST', params: { id }, body });
        navigate(`/mailboxes/${id}/drafts/${created.id}`);
      }
    } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  const attach = async (file: File) => {
    setBusy(true); setProblem(null);
    const form = new FormData(); form.set('file', file);
    try {
      const item = await upload<{ id: string; filename: string }>(`/api/mailboxes/${id}/attachments`, form);
      setAttachments((current) => [...current, item]);
    } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  return <Card title={existing ? 'Revise draft' : 'Compose draft'} description="Saving never sends. A revision changes the reviewed content and invalidates its previous approval.">
    <form className="form" onSubmit={submit}>
      <TextField label="To" value={to} onChange={(e) => setTo(e.target.value)} required hint="Separate addresses with commas." />
      <TextField label="CC" optional value={cc} onChange={(e) => setCc(e.target.value)} />
      <TextField label="BCC" optional value={bcc} onChange={(e) => setBcc(e.target.value)} />
      <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={300} />
      <TextAreaField label="Message" value={text} onChange={(e) => setText(e.target.value)} required rows={12} maxLength={100_000} />
      <TextField label="Attach a document" type="file" hint="Office documents, images or text. At most 3 MiB in total." disabled={busy} onChange={(e) => {
        const file = e.target.files?.[0]; if (file) void attach(file);
      }} />
      <ul>{attachments.map((a) => <li key={a.id}>{a.filename} <Button size="sm" variant="ghost" onClick={() => setAttachments((current) => current.filter((item) => item.id !== a.id))}>Remove attachment</Button></li>)}</ul>
      <ProblemAlert problem={problem} />
      <Button type="submit" variant="primary" busy={busy}>Save draft</Button>
    </form>
  </Card>;
}
