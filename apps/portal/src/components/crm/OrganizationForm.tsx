import { type FormEvent, useState } from 'react';
import { api } from '../../lib/api.ts';
import type { OrganizationDetail } from '../../lib/crm-client.ts';
import { Button, Dialog, ProblemAlert, SelectField, TextField } from '../ui.tsx';
import { useRun } from './use-run.ts';

const LIFECYCLES = ['prospect', 'active_client', 'past_client', 'partner', 'inactive'] as const;
const isLifecycle = (value: string): value is typeof LIFECYCLES[number] => LIFECYCLES.some((item) => item === value);
export function OrganizationForm({ org, onClose, onSaved }: { org: OrganizationDetail; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(org.name);
  const [website, setWebsite] = useState(org.website ?? '');
  const [industry, setIndustry] = useState(org.industry ?? '');
  const [geography, setGeography] = useState(org.geography ?? '');
  const [tags, setTags] = useState(org.tags.join(', '));
  const [lifecycle, setLifecycle] = useState(org.lifecycle);
  const { busy, problem, run } = useRun();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run('save', () => api('/api/crm/organizations/:id', { method: 'PATCH', params: { id: org.id }, body: {
      name, website: website || null, industry: industry || null, geography: geography || null,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), lifecycle,
    } }), onSaved);
  };
  return <Dialog open title="Edit organisation" onClose={() => !busy && onClose()}><form className="form" onSubmit={submit}>
    <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
    <TextField label="Website" optional value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={300} />
    <div className="form-grid"><TextField label="Industry" optional value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={120} />
      <TextField label="Geography" optional value={geography} onChange={(e) => setGeography(e.target.value)} maxLength={120} /></div>
    <TextField label="Tags" hint="Comma-separated." value={tags} onChange={(e) => setTags(e.target.value)} />
    <SelectField label="Lifecycle" value={lifecycle} onChange={(e) => { if (isLifecycle(e.target.value)) setLifecycle(e.target.value); }}>
      {LIFECYCLES.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
    </SelectField><ProblemAlert problem={problem} />
    <div className="dialog-actions"><Button onClick={onClose} disabled={!!busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy === 'save'}>Save changes</Button></div>
  </form></Dialog>;
}
