import { type FormEvent, useState } from 'react';
import { Alert, Button, Card, ProblemAlert, TextField, useTitle } from '../../components/ui.tsx';
import { api, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { Link } from '../../lib/router.tsx';
import { SectionHeader } from './PublicLayout.tsx';

const remove = (token: string) => api('/api/newsletter/unsubscribe/:token', { method: 'POST', params: { token } });
type Removed = Awaited<ReturnType<typeof remove>>;

/** Opening an email link never changes a subscription until its owner presses the button. */
export function UnsubscribePage({ token }: { readonly token?: string }) {
  useTitle('Unsubscribe');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<Removed | null>(null);
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setProblem(null);
    try {
      if (token) setResult(await remove(token));
      else { await api('/api/newsletter/unsubscribe-link', { method: 'POST', body: { email } }); setRequested(true); }
    } catch (err) { setProblem(problemFrom(err)); } finally { setBusy(false); }
  };
  return <div className="site-section site-narrow stack">
    <SectionHeader eyebrow="The Catalyst" title="Unsubscribe">Stop receiving our newsletters and event updates.</SectionHeader>
    {result ? <Alert tone={result.status === 'not_found' ? 'warning' : 'success'} title={result.status === 'not_found' ? 'Link not found' : result.status === 'already' ? 'Already unsubscribed' : 'You have been unsubscribed'}>
      {result.email ?? 'Request your unsubscribe link below if you no longer have a valid one.'}
    </Alert> : requested ? <Alert tone="success" title="Check your inbox">If this address is subscribed, we'll email its personal unsubscribe link. Nothing changes until you use that link.</Alert> :
      <Card><form className="form" onSubmit={submit}>
        {token ? <p>Choose Unsubscribe to stop future mail. No sign-in is needed.</p> : <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={problem?.fields.email} required maxLength={254} hint="We'll send a personal link so nobody else can unsubscribe your address." />}
        <ProblemAlert problem={problem} fieldsShown={['email']} />
        <div className="form-actions"><Button type="submit" variant="primary" busy={busy}>{token ? 'Unsubscribe' : 'Email my unsubscribe link'}</Button></div>
      </form></Card>}
    <div className="cluster"><Link to="/subscriber">Subscribe again</Link>{token && <Link to="/unsubscribe">Request another unsubscribe link</Link>}</div>
  </div>;
}
