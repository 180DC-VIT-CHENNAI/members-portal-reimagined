import { useState } from 'react';
import { AccessPanel } from '../../components/crm/AccessPanel.tsx';
import { ContactDialog } from '../../components/crm/ContactDialog.tsx';
import { OpportunityForm } from '../../components/crm/OpportunityForm.tsx';
import { OrganizationForm } from '../../components/crm/OrganizationForm.tsx';
import { Touchpoints } from '../../components/crm/Touchpoints.tsx';
import { BackLink, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from '../../components/ui.tsx';
import { useLoad } from '../../lib/api.ts';
import { loadOrganization, type OrganizationDetail } from '../../lib/crm-client.ts';
import { Link } from '../../lib/router.tsx';

export function OrganizationPage({ id }: { id: string }) {
  const loaded = useLoad(() => loadOrganization(id), [id]);
  const [dialog, setDialog] = useState<'organization' | 'contact' | 'opportunity' | null>(null);
  const [editingContact, setEditingContact] = useState<OrganizationDetail['contacts'][number] | null>(null);
  if (loaded.problem) return <ErrorState problem={loaded.problem} onRetry={loaded.reload} />;
  const org = loaded.data;
  if (!org) return <LoadingBlock />;
  const saved = () => { setDialog(null); setEditingContact(null); loaded.reload(); };
  return <div className="page"><BackLink to="/crm/organizations">Organisations</BackLink>
    <PageHeader overline="CRM" title={org.name} lede={[org.industry, org.geography, org.domain].filter(Boolean).join(' · ')}
      actions={org.access.edit && <Button icon="pencil" onClick={() => setDialog('organization')}>Edit organisation</Button>} />
    <div className="stack">
      <div className="cluster"><span className="badge">{org.lifecycle.replaceAll('_', ' ')}</span><span className="muted">Owner: {org.owner?.fullName ?? 'Unassigned'}</span>{org.tags.map((tag) => <span key={tag} className="chip">{tag}</span>)}</div>
      <Card title="Contacts" actions={org.access.edit && <Button icon="plus" onClick={() => setDialog('contact')}>Add contact</Button>}>
        {!org.contacts.length ? <EmptyState title="No contacts yet">Add the people you work with at this organisation.</EmptyState> :
          <ul className="activity-list">{org.contacts.map((contact) => <li key={contact.id} className="stack-sm">
            <div className="cluster"><h3>{contact.fullName}</h3><span className="muted">{contact.roleTitle}</span>
              {contact.doNotContact && <span className="badge badge-warning">Do not contact</span>}
              {org.access.edit && <Button size="sm" onClick={() => setEditingContact(contact)}>Edit contact</Button>}</div>
            {contact.email && <a className="text-link" href={`mailto:${contact.email}`}>{contact.email}</a>}
            {contact.phone && <p>{contact.phone}</p>}
            <p className="caption muted">Consent: {contact.consent === 'unknown' ? 'Not recorded' : contact.consent}{contact.preferredChannel && ` · Preferred: ${contact.preferredChannel}`}</p>
            {contact.restrictedNotes && <p className="pre-wrap">{contact.restrictedNotes}</p>}
          </li>)}</ul>}
      </Card>
      <Card title="Opportunities" actions={org.access.edit && <Button icon="plus" onClick={() => setDialog('opportunity')}>New opportunity</Button>}>
        {!org.opportunities.length ? <EmptyState title="No opportunities yet" /> : <ul className="activity-list">{org.opportunities.map((opportunity) => <li key={opportunity.id} className="cluster">
          <Link className="cell-primary" to={`/crm/opportunities/${opportunity.id}`}>{opportunity.title}</Link><span className="badge">{opportunity.stageLabel}</span><span className="muted">{opportunity.ownerName}</span>
        </li>)}</ul>}
      </Card>
      {!!org.engagements.length && <Card title="Engagements"><ul className="activity-list">{org.engagements.map((engagement) => <li key={engagement.id}>
        <Link to={`/crm/engagements/${engagement.id}`}>Open {engagement.status} engagement</Link>
      </li>)}</ul></Card>}
      <Touchpoints target={{ organizationId: id }} touchpoints={org.touchpoints} canLog={org.access.edit} onChange={loaded.reload} />
      {org.access.grants && <AccessPanel recordType="organization" id={id} />}
    </div>
    {dialog === 'organization' && <OrganizationForm org={org} onClose={() => setDialog(null)} onSaved={saved} />}
    {(dialog === 'contact' || editingContact) && <ContactDialog organizationId={id} contact={editingContact ?? undefined} onClose={() => { setDialog(null); setEditingContact(null); }} onSaved={saved} />}
    {dialog === 'opportunity' && <OpportunityForm organizationId={id} contacts={org.contacts} onClose={() => setDialog(null)} onSaved={saved} />}
  </div>;
}
