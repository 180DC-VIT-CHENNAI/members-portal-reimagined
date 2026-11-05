import { useId, useState } from 'react';
import '../../components/github/admin/admin.css';
import { ConnectionSection } from '../../components/github/admin/ConnectionSection.tsx';
import { DeliveriesSection } from '../../components/github/admin/DeliveriesSection.tsx';
import { PeopleSection } from '../../components/github/admin/PeopleSection.tsx';
import { RepositoriesSection } from '../../components/github/admin/RepositoriesSection.tsx';
import { BackLink, Card, ErrorState, LoadingBlock, PageHeader } from '../../components/ui.tsx';
import { useLoad } from '../../lib/api.ts';
import { github } from '../../lib/github-client.ts';
import { setupChecklist } from '../../lib/github-view.ts';
import { useSession } from '../../lib/session.tsx';
import { Forbidden } from './Forbidden.tsx';

type SectionName = 'connection' | 'repositories' | 'people' | 'deliveries';

const SECTIONS: readonly { readonly value: SectionName; readonly label: string }[] = [
  { value: 'connection', label: 'Connection' },
  { value: 'repositories', label: 'Repositories' },
  { value: 'people', label: 'People' },
  { value: 'deliveries', label: 'Deliveries' },
];

function GitHubAdmin() {
  const status = useLoad(() => github.status(), []);
  const [chosen, setChosen] = useState<SectionName | null>(null);
  const group = useId();
  const data = status.data;
  const ready = data ? setupChecklist(data).every((step) => step.done || step.optional) : false;
  const section = chosen ?? (ready ? 'repositories' : 'connection');

  return (
    <div className="page">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader overline="Admin" title="GitHub" lede="Connect the organisation, map repositories to projects and link members to their GitHub accounts." />
      <div className="stack">
        <div className="segmented" role="radiogroup" aria-label="GitHub settings">
          {SECTIONS.map((option) => (
            <label key={option.value}>
              <input type="radio" name={group} checked={section === option.value} onChange={() => setChosen(option.value)} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {section === 'connection' &&
          (data ? (
            <ConnectionSection status={data} onChanged={status.setData} />
          ) : (
            <Card flush>{status.problem ? <ErrorState problem={status.problem} onRetry={status.reload} /> : <LoadingBlock rows={4} label="Loading the connection" />}</Card>
          ))}
        {section === 'repositories' && <RepositoriesSection />}
        {section === 'people' && <PeopleSection />}
        {section === 'deliveries' && <DeliveriesSection />}
      </div>
    </div>
  );
}

export function GitHubAdminPage() {
  const { can } = useSession();
  if (!can('github.manage', null)) return <Forbidden title="GitHub" />;
  return <GitHubAdmin />;
}
