import { type FormEvent, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { Link } from '../../lib/router.tsx';
import { useSession } from '../../lib/session.tsx';

export function MailboxesPage() {
  const { can } = useSession();
  const load = useLoad(() => api('/api/mailboxes'), []);
  return <div className="page page-narrow">
    <PageHeader title="Shared mailboxes" lede="Functional addresses shared through explicit access. Your title never grants inbox access." />
    {can('mailboxes.admin') && <CreateMailbox onCreated={load.reload} />}
    {load.problem ? <ErrorState problem={load.problem} onRetry={load.reload} /> : !load.data ? <LoadingBlock /> :
      load.data.mailboxes.length === 0 ? <EmptyState icon="inbox" title="No mailboxes assigned">A mailbox manager can give you access.</EmptyState> :
        <div className="stack">{load.data.mailboxes.map(({ mailbox }) => <Card key={mailbox.id} title={<Link to={`/mailboxes/${mailbox.id}`}>{mailbox.displayName}</Link>}>
          <p>{mailbox.address}</p><p className="muted">{mailbox.purpose || 'Shared functional mailbox'}</p>
          <span className="badge">{mailbox.status}</span>
        </Card>)}</div>}
  </div>;
}

function CreateMailbox({ onCreated }: { readonly onCreated: () => void }) {
  const people = useLoad(() => api('/api/people', { query: { status: 'active' } }), []);
  const [address, setAddress] = useState(''), [displayName, setName] = useState(''), [managerId, setManager] = useState('');
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null);
  const { me } = useSession();
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setProblem(null);
    try {
      await api('/api/mailboxes', { method: 'POST', body: { address, displayName, managerId } });
      setAddress(''); setName(''); onCreated();
    } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  return <Card title="Create a shared mailbox" description="Assign a different manager. This does not create DNS rules, enable sending, or give you message access.">
    <form className="form" onSubmit={submit}>
      <TextField label="Address" type="email" value={address} onChange={(e) => setAddress(e.target.value)} required />
      <TextField label="Display name" value={displayName} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      <SelectField label="Manager" value={managerId} onChange={(e) => setManager(e.target.value)} required>
        <option value="">Choose a member</option>
        {people.data?.filter((p) => p.id !== me.id).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
      </SelectField>
      <ProblemAlert problem={problem ?? people.problem} />
      <Button type="submit" busy={busy} disabled={!managerId}>Create mailbox</Button>
    </form>
  </Card>;
}
