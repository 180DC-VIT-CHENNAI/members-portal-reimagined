import { type FormEvent, useState } from 'react';
import { api, lookups, useLoad } from '../../lib/api.ts';
import type { Proposal } from '../../lib/crm-client.ts';
import { navigate } from '../../lib/router.tsx';
import { useSession } from '../../lib/session.tsx';
import { Button, Dialog, ProblemAlert, SelectField, TextField } from '../ui.tsx';
import { useRun } from './use-run.ts';

export function AcceptProposal({ proposal, onClose }: { proposal: Proposal; onClose: () => void }) {
  const { can } = useSession();
  const departments = useLoad(() => lookups.departments(), []);
  const people = useLoad(() => api('/api/people', { query: { status: 'active' } }), []);
  const [departmentId, setDepartmentId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [confidentiality, setConfidentiality] = useState<'standard' | 'confidential' | 'restricted'>('confidential');
  const [deadline, setDeadline] = useState('');
  const { busy, problem, run } = useRun();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run('accept', async () => {
      const { engagementId } = await api('/api/crm/proposals/:id/accept', { method: 'POST', params: { id: proposal.id }, body: {
        departmentIds: [departmentId], leadId, confidentiality, deadline: deadline || null,
      } });
      navigate(`/crm/engagements/${engagementId}`);
    });
  };
  return <Dialog open title="Record client acceptance" onClose={() => !busy && onClose()}><form className="form" onSubmit={submit}>
    <p>This accepts version {proposal.currentVersion}, wins the opportunity and creates an engagement linked to a canonical project. No email is sent.</p>
    <SelectField label="Project department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required>
      <option value="">Choose a department</option>{(departments.data ?? []).filter((d) => can('projects.manage', d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </SelectField>
    <SelectField label="Engagement lead" value={leadId} onChange={(e) => setLeadId(e.target.value)} required>
      <option value="">Choose a person</option>{(people.data ?? []).filter((p) => p.status === 'active' || p.status === 'on_leave').map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
    </SelectField>
    <SelectField label="Confidentiality" value={confidentiality} onChange={(e) => { const v = e.target.value; if (v === 'standard' || v === 'confidential' || v === 'restricted') setConfidentiality(v); }}>
      <option value="standard">Standard</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option>
    </SelectField>
    <TextField label="Project deadline" type="date" optional value={deadline} onChange={(e) => setDeadline(e.target.value)} />
    <ProblemAlert problem={problem} /><div className="dialog-actions"><Button onClick={onClose} disabled={!!busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy === 'accept'} disabled={!departmentId || !leadId}>Accept and create engagement</Button></div>
  </form></Dialog>;
}
