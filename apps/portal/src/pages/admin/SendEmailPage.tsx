import { type FormEvent, useState } from 'react';
import { BackLink, Button, Card, PageHeader, ProblemAlert, TextAreaField, TextField } from '../../components/ui.tsx';
import { api, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { useSession } from '../../lib/session.tsx';
import { Forbidden } from './Forbidden.tsx';

export function SendEmailPage() {
  const { can } = useSession();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [result, setResult] = useState<string | null>(null);
  if (!can('email.send')) return <Forbidden title="Send email" />;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setResult(null);
    try {
      const sent = await api('/api/send-email', { method: 'POST', body: { to, subject, body } });
      setResult(`${sent.sent} accepted, ${sent.failed} failed, ${sent.queued} queued.`);
      setTo(''); setSubject(''); setBody('');
    } catch (error) { setProblem(problemFrom(error)); }
    finally { setBusy(false); }
  };
  return (
    <div className="page page-narrow">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader overline="Communications" title="Send email" lede="Send a plain-text message. Department access limits recipients to active members in your permitted departments." />
      <Card title="New message" description="Separate addresses with commas, spaces or semicolons. More than ten recipients are queued.">
        <form className="form" onSubmit={submit}>
          <TextAreaField label="Recipients" value={to} onChange={(e) => setTo(e.target.value)} required maxLength={20000} rows={3} error={problem?.fields.to} />
          <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={255} error={problem?.fields.subject} />
          <TextAreaField label="Message" value={body} onChange={(e) => setBody(e.target.value)} required maxLength={4000} rows={8} error={problem?.fields.body} />
          <ProblemAlert problem={problem} fieldsShown={['to', 'subject', 'body']} />
          {result && <p role="status">{result}</p>}
          <div className="form-actions"><Button type="submit" variant="primary" busy={busy} disabled={!to.trim() || !subject.trim() || !body.trim()}>Send message</Button></div>
        </form>
      </Card>
    </div>
  );
}
