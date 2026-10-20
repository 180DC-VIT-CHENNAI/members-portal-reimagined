import { useState } from 'react';
import { api } from '../../lib/api.ts';
import type { OpportunityDetail, Proposal } from '../../lib/crm-client.ts';
import { formatDateTime } from '../../lib/format.ts';
import { useSession } from '../../lib/session.tsx';
import { Button, Card, EmptyState, ProblemAlert } from '../ui.tsx';
import { AcceptProposal } from './AcceptProposal.tsx';
import { ProposalForm } from './ProposalForm.tsx';
import { useRun } from './use-run.ts';

export function Proposals({ opportunity, onChange }: { opportunity: OpportunityDetail; onChange: () => void }) {
  const { can } = useSession();
  const [editing, setEditing] = useState<Proposal | 'new' | null>(null);
  const [accepting, setAccepting] = useState<Proposal | null>(null);
  const { busy, problem, run } = useRun();
  return <Card title="Proposals" description="Versioned scope, objectives, timeline and deliverables. Mark sent only after sending through an approved channel."
    actions={opportunity.access.edit && !opportunity.engagement && <Button icon="plus" onClick={() => setEditing('new')}>New proposal</Button>}>
    <div className="stack"><ProblemAlert problem={problem} />
      {!opportunity.proposals.length && <EmptyState title="No proposals yet">Capture scope and deliverables after discovery.</EmptyState>}
      {opportunity.proposals.map((proposal) => <section key={proposal.id} className="stack-sm">
        <div className="cluster"><h3>{proposal.title}</h3><span className="badge">{proposal.status}</span><span className="caption muted">Version {proposal.currentVersion}</span></div>
        {opportunity.access.edit && !opportunity.engagement && <div className="cluster">
          {(proposal.status === 'draft' || proposal.status === 'sent') && <Button size="sm" onClick={() => setEditing(proposal)}>New version</Button>}
          {proposal.status === 'draft' && <Button size="sm" busy={busy === proposal.id} onClick={() => void run(proposal.id, () => api('/api/crm/proposals/:id/status', { method: 'POST', params: { id: proposal.id }, body: { status: 'sent' } }), onChange)}>Mark sent</Button>}
          {proposal.status === 'sent' && can('projects.manage') && <Button size="sm" variant="primary" onClick={() => setAccepting(proposal)}>Client accepted</Button>}
          {(proposal.status === 'draft' || proposal.status === 'sent') && <Button size="sm" busy={busy === proposal.id} onClick={() => void run(proposal.id, () => api('/api/crm/proposals/:id/status', { method: 'POST', params: { id: proposal.id }, body: { status: 'declined' } }), onChange)}>Mark declined</Button>}
        </div>}
        {proposal.versions.map((version) => <details key={version.id} open={version.version === proposal.currentVersion} className="crm-proposal-version">
          <summary>Version {version.version} · {version.frozenAt ? `Frozen ${formatDateTime(version.frozenAt)}` : 'Draft'}</summary>
          <div className="stack-sm crm-proposal-print">
            <h4>Scope</h4><p className="pre-wrap">{version.scope}</p>
            {!!version.objectives && <><h4>Objectives</h4><p className="pre-wrap">{version.objectives}</p></>}
            {!!version.timeline && <><h4>Timeline</h4><p className="pre-wrap">{version.timeline}</p></>}
            {!!version.deliverables && <><h4>Deliverables</h4><p className="pre-wrap">{version.deliverables}</p></>}
          </div>
        </details>)}
      </section>)}
      {editing && <ProposalForm opportunityId={opportunity.id} proposal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChange(); }} />}
      {accepting && <AcceptProposal proposal={accepting} onClose={() => setAccepting(null)} />}
    </div>
  </Card>;
}
