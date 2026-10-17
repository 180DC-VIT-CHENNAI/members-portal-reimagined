import { useState } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, SearchField, SelectField } from '../components/ui.tsx';
import { api, useLoad } from '../lib/api.ts';
import { formatDate } from '../lib/format.ts';
import { Link, navigate } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';

const loadProjects = () => api('/api/projects');
type Status = 'active' | 'completed';

/** Every project the caller can see, filtered by status, term and a search. */
export function ProjectsPage() {
  const { can } = useSession();
  const projects = useLoad(loadProjects, []);
  const [status, setStatus] = useState<Status>('active');
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');

  const all = projects.data ?? [];
  const terms = [...new Map(all.flatMap((p) => (p.termId && p.termLabel ? [[p.termId, p.termLabel] as const] : []))).entries()];
  const needle = query.trim().toLowerCase();
  const shown = all.filter(
    (p) => p.status === status && (!term || p.termId === term) && (!needle || `${p.name} ${p.client ?? ''}`.toLowerCase().includes(needle)),
  );

  return (
    <div className="page">
      <PageHeader
        overline="Work"
        title="Projects"
        lede="Client projects, the people on them and their tasks."
        actions={
          can('projects.manage') && (
            <Button variant="primary" icon="plus" onClick={() => navigate('/projects/new')}>
              New project
            </Button>
          )
        }
      />
      <div className="stack">
        <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
          <SearchField label="Search" placeholder="Name or client" value={query} onChange={(e) => setQuery(e.target.value)} />
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </SelectField>
          {terms.length > 0 && (
            <SelectField label="Term" value={term} onChange={(e) => setTerm(e.target.value)}>
              <option value="">All terms</option>
              {terms.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </SelectField>
          )}
        </form>
        {projects.problem ? (
          <ErrorState problem={projects.problem} onRetry={projects.reload} />
        ) : !projects.data ? (
          <LoadingBlock />
        ) : shown.length === 0 ? (
          <EmptyState icon="clipboard" title={all.length === 0 ? 'No projects yet' : 'No projects match'}>
            {all.length === 0 ? "Your department's projects, and projects you're named on, show up here." : 'Try another status, term or search.'}
          </EmptyState>
        ) : (
          <Card flush>
            <div className="table-wrap">
              <table className="table table-stack">
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">Departments</th>
                    <th scope="col">Term</th>
                    <th scope="col">Deadline</th>
                    <th scope="col">Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id}>
                      <td className="cell-primary">
                        <Link to={`/projects/${p.id}`}>{p.name}</Link>
                        {p.client && <div className="caption muted">{p.client}</div>}
                      </td>
                      <td data-label="Departments">{p.departments.map((d) => d.name).join(', ')}</td>
                      <td data-label="Term">{p.termLabel ?? '—'}</td>
                      <td data-label="Deadline">{p.deadline ? formatDate(p.deadline) : '—'}</td>
                      <td data-label="Tasks">{p.tasks.total ? `${p.tasks.completed} of ${p.tasks.total} done` : 'None yet'}</td>
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
