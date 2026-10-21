import { useState } from 'react';
import { BackLink, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, SearchField } from '../../components/ui.tsx';
import { useLoad } from '../../lib/api.ts';
import { loadOrganizations } from '../../lib/crm-client.ts';
import { Link } from '../../lib/router.tsx';

export function OrganizationsPage() {
  const [q, setQ] = useState('');
  const list = useLoad(() => loadOrganizations(q), [q]);
  return <div className="page"><BackLink to="/crm">CRM pipeline</BackLink>
    <PageHeader title="Organisations" lede="Only organisations you own or were given access to." />
    <div className="stack"><SearchField label="Search organisations" placeholder="Name or website domain" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.problem ? <ErrorState problem={list.problem} onRetry={list.reload} /> : !list.data ? <LoadingBlock /> :
        !list.data.length ? <EmptyState title="No organisations match">Create an organisation from the pipeline or ask its owner for access.</EmptyState> :
          <Card flush><div className="table-wrap"><table className="table table-stack"><thead><tr><th>Organisation</th><th>Lifecycle</th><th>Owner</th><th>Opportunities</th></tr></thead>
            <tbody>{list.data.map((org) => <tr key={org.id}><td className="cell-primary"><Link to={`/crm/organizations/${org.id}`}>{org.name}</Link><div className="caption muted">{org.domain}</div></td>
              <td data-label="Lifecycle">{org.lifecycle.replaceAll('_', ' ')}</td><td data-label="Owner">{org.ownerName ?? 'Unassigned'}</td><td data-label="Opportunities">{org.opportunities}</td>
            </tr>)}</tbody></table></div></Card>}
    </div></div>;
}
