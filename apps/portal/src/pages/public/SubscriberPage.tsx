import { type FormEvent, useState } from 'react';
import { Alert, Button, Card, ProblemAlert, TextField, useTitle } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { Link, setQuery, useLocation } from '../../lib/router.tsx';
import { SectionHeader } from './PublicLayout.tsx';

/** Email ownership, not Google membership, is all a newsletter subscriber needs. */
export function SubscriberPage() {
  useTitle('The Catalyst');
  const { query } = useLocation();
  const count = useLoad(() => api('/api/newsletter/subscribers/count'), []);
  const token = query.get('confirm');
  return (
    <div className="site-section site-narrow stack">
      <SectionHeader eyebrow="The Catalyst" title="Good ideas. Real impact.">
        Case studies, impact stories, events and opportunities from 180DC VIT Chennai. No member account needed.
      </SectionHeader>
      {count.data && count.data.count > 0 && <p className="caption muted">Join {count.data.count.toLocaleString()} confirmed readers.</p>}
      {query.get('confirmed') === '1' ? (
        <Alert tone="success" title="You're subscribed">Look out for our next issue. Every email has an unsubscribe link.</Alert>
      ) : token ? <ConfirmSubscription token={token} /> : <SubscribeForm />}
      <p className="caption muted"><Link to="/unsubscribe">Unsubscribe or request your unsubscribe link</Link></p>
    </div>
  );
}

function SubscribeForm() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setProblem(null);
    try {
      await api('/api/newsletter/subscribe', { method: 'POST', body: { email, name: name.trim() || null } });
      setPending(true);
    } catch (err) { setProblem(problemFrom(err)); } finally { setBusy(false); }
  };
  if (pending) return <Alert tone="success" title="Check your inbox">If this address isn't already subscribed, we'll send a confirmation link. Click it within 48 hours to start receiving mail.</Alert>;
  return (
    <Card>
      <form className="form" onSubmit={submit}>
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={problem?.fields.email} required maxLength={254} />
        <TextField label="Name" optional autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={problem?.fields.name} maxLength={120} />
        <p className="caption muted">By confirming, you agree to receive our newsletters and event updates. Unsubscribe any time.</p>
        <ProblemAlert problem={problem} fieldsShown={['email', 'name']} />
        <div className="form-actions"><Button type="submit" variant="primary" busy={busy}>Send confirmation link</Button></div>
      </form>
    </Card>
  );
}

function ConfirmSubscription({ token }: { readonly token: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const confirm = async () => {
    setBusy(true); setProblem(null);
    try {
      await api('/api/newsletter/confirm', { method: 'POST', body: { token } });
      setQuery({ confirm: null, confirmed: '1' });
    } catch (err) { setProblem(problemFrom(err)); setBusy(false); }
  };
  return <Card title="One last step" description="Confirm that you'd like to receive The Catalyst at the address you gave us.">
    <div className="stack"><ProblemAlert problem={problem} />
      <div className="cluster"><Button variant="primary" busy={busy} onClick={() => void confirm()}>Confirm subscription</Button><Link to="/subscriber">Request a new link</Link></div>
    </div>
  </Card>;
}
