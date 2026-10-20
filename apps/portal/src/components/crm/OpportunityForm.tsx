import { type FormEvent, useState } from 'react';
import { api } from '../../lib/api.ts';
import type { OpportunityDetail, OrganizationDetail } from '../../lib/crm-client.ts';
import { navigate } from '../../lib/router.tsx';
import { Button, Dialog, ProblemAlert, SelectField, TextField } from '../ui.tsx';
import { useRun } from './use-run.ts';

export function OpportunityForm({ organizationId, contacts = [], opportunity, onClose, onSaved }: {
  organizationId: string; contacts?: OrganizationDetail['contacts']; opportunity?: OpportunityDetail; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(opportunity?.title ?? '');
  const [primaryContactId, setPrimaryContactId] = useState(opportunity?.primaryContactId ?? '');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>(opportunity?.priority ?? 'normal');
  const [nextAction, setNextAction] = useState(opportunity?.nextAction ?? '');
  const [nextActionDue, setNextActionDue] = useState(opportunity?.nextActionDue ?? '');
  const { busy, problem, run } = useRun();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { title, priority, nextAction: nextAction || null, nextActionDue: nextActionDue || null };
    void run('save', async () => {
      if (opportunity) await api('/api/crm/opportunities/:id', { method: 'PATCH', params: { id: opportunity.id }, body: fields });
      else {
        const { id } = await api('/api/crm/organizations/:id/opportunities', { method: 'POST', params: { id: organizationId }, body: { ...fields, primaryContactId: primaryContactId || null } });
        navigate(`/crm/opportunities/${id}`);
      }
    }, onSaved);
  };
  return <Dialog open title={opportunity ? 'Edit opportunity' : 'New opportunity'} onClose={() => !busy && onClose()}><form className="form" onSubmit={submit}>
    <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
    {!opportunity && <SelectField label="Primary contact" optional value={primaryContactId} onChange={(e) => setPrimaryContactId(e.target.value)}>
      <option value="">None</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName}</option>)}
    </SelectField>}
    <SelectField label="Priority" value={priority} onChange={(e) => { const value = e.target.value; if (value === 'low' || value === 'normal' || value === 'high') setPriority(value); }}>
      <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
    </SelectField>
    <TextField label="Next action" optional value={nextAction} onChange={(e) => setNextAction(e.target.value)} maxLength={300} />
    <TextField label="Next action due" optional type="date" value={nextActionDue} onChange={(e) => setNextActionDue(e.target.value)} />
    <ProblemAlert problem={problem} /><div className="dialog-actions"><Button onClick={onClose} disabled={!!busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy === 'save'}>Save opportunity</Button></div>
  </form></Dialog>;
}
