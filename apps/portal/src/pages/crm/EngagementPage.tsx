import { type FormEvent, useState } from 'react';
import { useRun } from '../../components/crm/use-run.ts';
import { Alert, BackLink, Button, Card, ErrorState, LoadingBlock, PageHeader, ProblemAlert, TextAreaField } from '../../components/ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import { loadEngagement, type EngagementDetail } from '../../lib/crm-client.ts';
import { formatDateTime } from '../../lib/format.ts';
import { Link } from '../../lib/router.tsx';

export function EngagementPage({ id }: { id: string }) {
  const loaded = useLoad(() => loadEngagement(id), [id]);
  if (loaded.problem) return <ErrorState problem={loaded.problem} onRetry={loaded.reload} />;
  const engagement = loaded.data;
  if (!engagement) return <LoadingBlock />;
  return <div className="page"><BackLink to={`/crm/opportunities/${engagement.opportunityId}`}>Opportunity</BackLink>
    <PageHeader overline={engagement.organization.name} title={engagement.opportunity.title} lede="Engagement and closeout" />
    <div className="stack"><div className="cluster"><span className="badge">{engagement.status}</span><span className="badge">{engagement.confidentiality}</span></div>
      <Card title="Delivery"><dl className="dl"><dt>Client owner</dt><dd>{engagement.clientOwnerName ?? 'Unassigned'}</dd><dt>Lead</dt><dd>{engagement.leadName ?? 'Unassigned'}</dd>
        <dt>Accepted proposal</dt><dd>{engagement.proposal?.title} · Version {engagement.proposal?.version}</dd></dl>
        {engagement.project ? <Link className="text-link" to={`/projects/${engagement.project.id}`}>Open canonical project: {engagement.project.name}</Link> : <p className="muted">The linked project was removed.</p>}
        <p className="hint">Manage people, tasks and delivery files on the linked project. Closeout does not publish or complete the project.</p>
      </Card>
      <Closeout key={`${engagement.id}-${engagement.updatedAt}-${engagement.status}`} engagement={engagement} onChange={loaded.reload} />
      {engagement.caseStudyDraft && <Alert tone="info" title="Case-study draft saved, not published"><p>{engagement.caseStudyDraft.title}</p><p className="pre-wrap">{engagement.caseStudyDraft.summary}</p><p>It stays private until a separate editorial review and publication step.</p></Alert>}
    </div></div>;
}

function Closeout({ engagement, onChange }: { engagement: EngagementDetail; onChange: () => void }) {
  const [deliverablesAccepted, setDeliverablesAccepted] = useState(engagement.deliverablesAccepted);
  const [filesArchived, setFilesArchived] = useState(engagement.filesArchived);
  const [knowledgeTransferDone, setKnowledgeTransferDone] = useState(engagement.knowledgeTransferDone);
  const [caseStudyConsent, setCaseStudyConsent] = useState(engagement.caseStudyConsent);
  const [clientFeedback, setClientFeedback] = useState(engagement.clientFeedback ?? '');
  const { busy, problem, run } = useRun();
  const editable = engagement.access.edit && engagement.status === 'active';
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run('save', () => api('/api/crm/engagements/:id/closeout', { method: 'PATCH', params: { id: engagement.id }, body: {
      deliverablesAccepted, filesArchived, knowledgeTransferDone, caseStudyConsent, clientFeedback: clientFeedback || null,
    } }), onChange);
  };
  return <Card title="Closeout checklist" description="Save the completed checklist before closing. Case-study consent is separate from acceptance of the work.">
    {engagement.closedAt && <p className="muted">Closed {formatDateTime(engagement.closedAt)}</p>}
    <form className="form" onSubmit={save}>
      <label className="check"><input type="checkbox" disabled={!editable} checked={deliverablesAccepted} onChange={(e) => setDeliverablesAccepted(e.target.checked)} />Client accepted deliverables</label>
      <label className="check"><input type="checkbox" disabled={!editable} checked={filesArchived} onChange={(e) => setFilesArchived(e.target.checked)} />Files archived with the agreed access</label>
      <label className="check"><input type="checkbox" disabled={!editable} checked={knowledgeTransferDone} onChange={(e) => setKnowledgeTransferDone(e.target.checked)} />Knowledge transfer complete</label>
      <TextAreaField label="Client feedback" optional disabled={!editable} value={clientFeedback} onChange={(e) => setClientFeedback(e.target.value)} maxLength={4000} />
      <label className="check"><input type="checkbox" disabled={!editable} checked={caseStudyConsent} onChange={(e) => setCaseStudyConsent(e.target.checked)} />Client consented to a case-study draft</label>
      <p className="hint">With consent, closing creates an internal draft only. No public case study or email is created.</p>
      <ProblemAlert problem={problem} />
      {editable && <div className="cluster">
        <Button type="submit" variant="primary" busy={busy === 'save'} disabled={!!busy}>Save checklist</Button>
        <Button busy={busy === 'close'} disabled={!!busy || engagement.missing.length > 0} onClick={() => void run('close', () => api('/api/crm/engagements/:id/close', { method: 'POST', params: { id: engagement.id } }), onChange)}>Close engagement</Button>
      </div>}
    </form>
  </Card>;
}
