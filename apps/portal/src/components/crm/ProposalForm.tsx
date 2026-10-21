import { type FormEvent, useState } from 'react';
import { api } from '../../lib/api.ts';
import type { Proposal } from '../../lib/crm-client.ts';
import { Button, Dialog, ProblemAlert, TextAreaField, TextField } from '../ui.tsx';
import { useRun } from './use-run.ts';

export function ProposalForm({ opportunityId, proposal, onClose, onSaved }: {
  opportunityId: string; proposal?: Proposal; onClose: () => void; onSaved: () => void;
}) {
  const current = proposal?.versions.find((version) => version.version === proposal.currentVersion);
  const [title, setTitle] = useState(proposal?.title ?? '');
  const [scope, setScope] = useState(current?.scope ?? '');
  const [objectives, setObjectives] = useState(current?.objectives ?? '');
  const [timeline, setTimeline] = useState(current?.timeline ?? '');
  const [deliverables, setDeliverables] = useState(current?.deliverables ?? '');
  const { busy, problem, run } = useRun();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const content = { scope, objectives, timeline, deliverables };
    void run('save', () => proposal
      ? api('/api/crm/proposals/:id/versions', { method: 'POST', params: { id: proposal.id }, body: content })
      : api('/api/crm/opportunities/:id/proposals', { method: 'POST', params: { id: opportunityId }, body: { title, ...content } }), onSaved);
  };
  return <Dialog open title={proposal ? `New version of ${proposal.title}` : 'New proposal'} onClose={() => !busy && onClose()}>
    <form className="form" onSubmit={submit}>
      {!proposal && <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />}
      {proposal && <p className="muted">Version {proposal.currentVersion} will be frozen. This version starts as a draft.</p>}
      <TextAreaField label="Scope" value={scope} onChange={(e) => setScope(e.target.value)} maxLength={8000} rows={4} required />
      <TextAreaField label="Objectives" optional value={objectives} onChange={(e) => setObjectives(e.target.value)} maxLength={8000} rows={3} />
      <TextAreaField label="Timeline" optional value={timeline} onChange={(e) => setTimeline(e.target.value)} maxLength={4000} rows={3} />
      <TextAreaField label="Deliverables" optional value={deliverables} onChange={(e) => setDeliverables(e.target.value)} maxLength={8000} rows={3} />
      <ProblemAlert problem={problem} /><div className="dialog-actions"><Button onClick={onClose} disabled={!!busy}>Cancel</Button>
        <Button type="submit" variant="primary" busy={busy === 'save'}>Save proposal version</Button></div>
    </form>
  </Dialog>;
}
