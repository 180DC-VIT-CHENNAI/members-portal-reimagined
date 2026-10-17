import { useState } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, SearchField } from '../components/ui.tsx';
import { useLoad } from '../lib/api.ts';
import { plural } from '../lib/format.ts';
import { Link, navigate } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { loadInstances } from '../lib/team-client.ts';

/** Every team instance the caller can see, newest first. */
export function TeamInstancesPage() {
  const { can } = useSession();
  const instances = useLoad(loadInstances, []);
  const [query, setQuery] = useState('');
  const all = instances.data ?? [];
  const needle = query.trim().toLowerCase();
  const shown = all.filter((i) => !needle || `${i.name} ${i.description ?? ''} ${i.departments.map((d) => d.name).join(' ')}`.toLowerCase().includes(needle));

  return (
    <div className="page">
      <PageHeader
        overline="Work"
        title="Team instances"
        lede="Competitions, events and exercises where people are split into teams, with outside participants and levels."
        actions={
          can('team_instances.manage') && (
            <Button variant="primary" icon="plus" onClick={() => navigate('/teams/new')}>
              New instance
            </Button>
          )
        }
      />
      <div className="stack">
        {all.length > 0 && (
          <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
            <SearchField label="Search" placeholder="Name or department" value={query} onChange={(e) => setQuery(e.target.value)} />
          </form>
        )}
        {instances.problem ? (
          <ErrorState problem={instances.problem} onRetry={instances.reload} />
        ) : !instances.data ? (
          <LoadingBlock />
        ) : shown.length === 0 ? (
          <EmptyState icon="trophy" title={all.length === 0 ? 'No team instances yet' : 'No instances match'}>
            {all.length === 0 ? 'Instances for your departments show up here.' : 'Try another search.'}
          </EmptyState>
        ) : (
          <Card flush>
            <div className="table-wrap">
              <table className="table table-stack">
                <thead>
                  <tr>
                    <th scope="col">Instance</th>
                    <th scope="col">Departments</th>
                    <th scope="col">Teams</th>
                    <th scope="col">Placements</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => (
                    <tr key={i.id}>
                      <td className="cell-primary">
                        <Link to={`/teams/${i.id}`}>{i.name}</Link>
                        {i.description && <div className="caption muted clamp-4">{i.description}</div>}
                      </td>
                      <td data-label="Departments">{i.departments.map((d) => d.name).join(', ')}</td>
                      <td data-label="Teams">
                        <span className="cluster">
                          {i.stats.teams ? plural(i.stats.teams, 'team') : 'None yet'}
                          {i.stats.short > 0 && <span className="badge badge-warning">{i.stats.short} short</span>}
                        </span>
                      </td>
                      <td data-label="Placements">{i.stats.placements}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
