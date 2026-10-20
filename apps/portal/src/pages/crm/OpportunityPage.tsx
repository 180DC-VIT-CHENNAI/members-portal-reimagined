import { useState } from 'react';
import { AccessPanel } from '../../components/crm/AccessPanel.tsx';
import { OpportunityForm } from '../../components/crm/OpportunityForm.tsx';
import { Proposals } from '../../components/crm/Proposals.tsx';
import { StageForm } from '../../components/crm/StageForm.tsx';
import { Touchpoints } from '../../components/crm/Touchpoints.tsx';
import { BackLink, Button, Card, ErrorState, LoadingBlock, PageHeader } from '../../components/ui.tsx';
import { useLoad } from '../../lib/api.ts';
import { loadOpportunity, loadSummary, LOST_REASONS } from '../../lib/crm-client.ts';
import { formatDate } from '../../lib/format.ts';
import { Link } from '../../lib/router.tsx';

export function OpportunityPage({ id }: { id: string }) {
  const loaded = useLoad(() => loadOpportunity(id), [id]);
  const summary = useLoad(loadSummary, []);
  const [editing, setEditing] = useState(false);
  if (loaded.problem) return <ErrorState problem={loaded.problem} onRetry={loaded.reload} />;
  const opportunity = loaded.data;
  if (!opportunity) return <LoadingBlock />;
  return <div className="page"><BackLink to="/crm">CRM pipeline</BackLink>
    <PageHeader overline={opportunity.organization.name} title={opportunity.title}
      actions={opportunity.access.edit && <Button icon="pencil" onClick={() => setEditing(true)}>Edit opportunity</Button>} />
    <div className="stack">
      <div className="cluster"><span className="badge">{opportunity.stage?.label}</span><span className="muted">Owner: {opportunity.owner?.fullName ?? 'Unassigned'}</span>
        {opportunity.organization.canOpen && <Link to={`/crm/organizations/${opportunity.organizationId}`}>Open organisation</Link>}
        {opportunity.lostReason && <span>{LOST_REASONS[opportunity.lostReason]}</span>}
      </div>
      <Card title="Next step"><p>{opportunity.nextAction ?? 'No next step recorded.'}</p>{opportunity.nextActionDue && <p className="muted">Due {formatDate(opportunity.nextActionDue)}</p>}</Card>
      {opportunity.primaryContact && <Card title="Primary contact"><h3>{opportunity.primaryContact.fullName}</h3><p>{opportunity.primaryContact.roleTitle}</p>
        {opportunity.primaryContact.email && <p>{opportunity.primaryContact.email}</p>}
        {!opportunity.primaryContact.private && <p className="muted">Private contact fields require contact or organisation access.</p>}
      </Card>}
      {opportunity.engagement && <Card title="Engagement"><Link className="text-link" to={`/crm/engagements/${opportunity.engagement.id}`}>Open {opportunity.engagement.status} engagement</Link></Card>}
      {opportunity.access.edit && summary.data && <StageForm key={opportunity.stageId} opportunity={opportunity} stages={summary.data.stages} onChange={loaded.reload} />}
      <Proposals opportunity={opportunity} onChange={loaded.reload} />
      <Touchpoints target={{ opportunityId: id }} touchpoints={opportunity.touchpoints} canLog={opportunity.access.edit} onChange={loaded.reload} />
      {opportunity.access.grants && <AccessPanel recordType="opportunity" id={id} />}
    </div>
    {editing && <OpportunityForm organizationId={opportunity.organizationId} opportunity={opportunity} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); loaded.reload(); }} />}
  </div>;
}
