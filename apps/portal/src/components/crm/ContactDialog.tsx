import { type FormEvent, useState } from 'react';
import { api } from '../../lib/api.ts';
import type { OrganizationDetail } from '../../lib/crm-client.ts';
import { Button, Dialog, ProblemAlert, SelectField, TextAreaField, TextField } from '../ui.tsx';
import { useRun } from './use-run.ts';

type Contact = OrganizationDetail['contacts'][number];
export function ContactDialog({ organizationId, contact, onClose, onSaved }: {
  organizationId: string; contact?: Contact; onClose: () => void; onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(contact?.fullName ?? '');
  const [roleTitle, setRoleTitle] = useState(contact?.roleTitle ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [consent, setConsent] = useState<'unknown' | 'granted' | 'withdrawn'>(contact?.consent ?? 'unknown');
  const [doNotContact, setDoNotContact] = useState(contact?.doNotContact ?? false);
  const [preferredChannel, setPreferredChannel] = useState(contact?.preferredChannel ?? '');
  const [restrictedNotes, setRestrictedNotes] = useState(contact?.restrictedNotes ?? '');
  const { busy, problem, run } = useRun();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = { fullName, roleTitle: roleTitle || null, email: email || null, phone: phone || null, consent, doNotContact, preferredChannel: preferredChannel || null, restrictedNotes: restrictedNotes || null };
    void run('save', () => contact
      ? api('/api/crm/contacts/:id', { method: 'PATCH', params: { id: contact.id }, body })
      : api('/api/crm/organizations/:id/contacts', { method: 'POST', params: { id: organizationId }, body }), onSaved);
  };
  return <Dialog open title={contact ? 'Edit contact' : 'New contact'} onClose={() => !busy && onClose()}>
    <form className="form" onSubmit={submit}><div className="form-grid">
      <TextField label="Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} />
      <TextField label="Role" optional value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} maxLength={120} />
      <TextField label="Business email" optional type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
      <TextField label="Phone" optional type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
      <SelectField label="Contact consent" value={consent} onChange={(e) => { const value = e.target.value; if (value === 'unknown' || value === 'granted' || value === 'withdrawn') setConsent(value); }}>
        <option value="unknown">Not recorded</option><option value="granted">Granted</option><option value="withdrawn">Withdrawn</option>
      </SelectField>
      <TextField label="Preferred channel" optional value={preferredChannel} onChange={(e) => setPreferredChannel(e.target.value)} maxLength={40} />
    </div>
      <label className="check"><input type="checkbox" checked={doNotContact} onChange={(e) => setDoNotContact(e.target.checked)} />Do not contact</label>
      <TextAreaField label="Restricted notes" hint="Visible only to this contact's collaborators, organisation collaborators and CRM admins." value={restrictedNotes} onChange={(e) => setRestrictedNotes(e.target.value)} maxLength={4000} />
      <ProblemAlert problem={problem} /><div className="dialog-actions"><Button onClick={onClose} disabled={!!busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy === 'save'}>Save contact</Button></div>
    </form></Dialog>;
}
