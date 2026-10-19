import { type FormEvent, useState } from 'react';
import { Button, Card, ProblemAlert, SelectField, TextAreaField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { MAILBOX_CAPABILITIES, type MailboxCapability } from '../../server/mailboxes/types.ts';

type Mailbox = Awaited<ReturnType<typeof loadMailbox>>['mailbox'];
const loadMailbox = (id: string) => api('/api/mailboxes/:id', { params: { id } });

export function MailboxManagement({ id, mailbox, onChanged }: { readonly id: string; readonly mailbox: Mailbox; readonly onChanged: () => void }) {
  const people = useLoad(() => api('/api/people', { query: {} }), []);
  const membership = useLoad(() => api('/api/mailboxes/:id/members', { params: { id } }), [id]);
  const [personId, setPerson] = useState(''), [capabilities, setCapabilities] = useState<MailboxCapability[]>([]);
  const [signature, setSignature] = useState(mailbox.signature);
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setProblem(null);
    try { await action(); membership.reload(); onChanged(); } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(() => api('/api/mailboxes/:id/members/:personId', { method: 'PUT', params: { id, personId }, body: { capabilities } }));
  };
  return <Card title="Mailbox management" description="Management does not imply reading, drafting, approval or sending. You cannot change your own grants.">
    <ProblemAlert problem={problem ?? people.problem ?? membership.problem} />
    <div className="cluster">
      <Button busy={busy} onClick={() => run(() => api('/api/mailboxes/:id', { method: 'PATCH', params: { id }, body: { outboundPaused: !mailbox.outboundPaused } }))}>
        {mailbox.outboundPaused ? 'Resume approved sends' : 'Pause outbound sends'}
      </Button>
    </div>
    <TextAreaField label="Approved signature" value={signature} onChange={(e) => setSignature(e.target.value)} maxLength={2000} />
    <Button busy={busy} onClick={() => run(() => api('/api/mailboxes/:id', { method: 'PATCH', params: { id }, body: { signature } }))}>Save signature and invalidate old approvals</Button>
    <form className="form" onSubmit={save}>
      <SelectField label="Member" value={personId} onChange={(e) => {
        const next = e.target.value; setPerson(next);
        setCapabilities(membership.data?.members.filter((m) => m.personId === next).map((m) => m.capability) ?? []);
      }} required>
        <option value="">Choose a member</option>
        {people.data?.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
      </SelectField>
      <fieldset><legend>Explicit capabilities</legend><div className="stack-sm">
        {MAILBOX_CAPABILITIES.map((capability) => <label key={capability} className="check">
          <input type="checkbox" checked={capabilities.includes(capability)} onChange={(e) => setCapabilities((current) =>
            e.target.checked ? [...current, capability] : current.filter((cap) => cap !== capability))} />
          {capability.replace('mailbox.', '').replaceAll('.', ' ').replaceAll('_', ' ')}
        </label>)}
      </div></fieldset>
      <Button type="submit" busy={busy} disabled={!personId}>Save grants</Button>
    </form>
    <ul className="stack">{[...new Set(membership.data?.members.map((m) => m.personId))].map((memberId) => {
      const rows = membership.data?.members.filter((m) => m.personId === memberId) ?? [];
      return <li key={memberId}><strong>{rows[0]?.name}</strong><p className="muted">{rows.map((m) => m.capability.replace('mailbox.', '')).join(', ')}</p>
        <Button variant="danger-quiet" busy={busy} onClick={() => run(() => api('/api/mailboxes/:id/members/:personId', { method: 'DELETE', params: { id, personId: memberId } }))}>Remove access</Button>
      </li>;
    })}</ul>
  </Card>;
}
