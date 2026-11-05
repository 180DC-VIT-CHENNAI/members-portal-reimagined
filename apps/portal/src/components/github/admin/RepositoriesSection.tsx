import { type FormEvent, useState } from 'react';
import { api, useLoad } from '../../../lib/api.ts';
import { relativeTime } from '../../../lib/format.ts';
import { github } from '../../../lib/github-client.ts';
import { syncPresentation } from '../../../lib/github-view.ts';
import type { RepositoryAdminRow } from '../../../server/github/types.ts';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, ProblemAlert, SearchField, SelectField } from '../../ui.tsx';
import { ExternalLink, ToneBadge } from '../parts.tsx';
import { useAction } from '../use-action.ts';

type MappedFilter = 'all' | 'mapped' | 'unmapped';

const FILTERS: readonly { readonly value: MappedFilter; readonly label: string }[] = [
  { value: 'all', label: 'All repositories' },
  { value: 'mapped', label: 'Mapped to a project' },
  { value: 'unmapped', label: 'Not mapped' },
];

export function RepositoriesSection() {
  const [filter, setFilter] = useState<MappedFilter>('all');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [unmapping, setUnmapping] = useState<RepositoryAdminRow | null>(null);
  const repos = useLoad(() => github.repositories({ ...(filter === 'all' ? {} : { mapped: filter === 'mapped' }), q: applied }), [filter, applied]);
  const projects = useLoad(() => api('/api/projects'), []);
  const act = useAction();
  const pending = act.busy !== null;

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setApplied(search.trim());
  };

  const mutate = async (key: string, write: () => Promise<unknown>) => {
    const result = await act.run(key, write);
    if (result.ok) repos.reload();
    return result.ok;
  };
  const choose = (row: RepositoryAdminRow, value: string) => {
    if (value === '') setUnmapping(row);
    else void mutate(`map:${row.id}`, () => github.mapRepository(row.id, value));
  };
  const confirmUnmap = async () => {
    if (!unmapping) return;
    if (await mutate(`map:${unmapping.id}`, () => github.mapRepository(unmapping.id, null))) setUnmapping(null);
  };

  const rows = repos.data?.repositories ?? [];
  const filtered = filter !== 'all' || applied !== '';

  return (
    <Card flush title="Repositories" description="Each repository feeds the board of the project it is mapped to.">
      <div className="gha-pad">
        <div className="stack">
          <form className="filters" role="search" aria-label="Filter repositories" onSubmit={submitSearch}>
            <SearchField label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Repository name" />
            <SelectField label="Show" value={filter} onChange={(event) => setFilter(FILTERS.find((option) => option.value === event.target.value)?.value ?? 'all')}>
              {FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
            <Button type="submit">Search</Button>
          </form>
          <ProblemAlert problem={act.problem} />
          {projects.problem && <ErrorState problem={projects.problem} onRetry={projects.reload} title="Couldn't load the projects" />}
        </div>
      </div>
      {!repos.data ? (
        repos.problem ? (
          <ErrorState problem={repos.problem} onRetry={repos.reload} />
        ) : (
          <LoadingBlock rows={4} label="Loading repositories" />
        )
      ) : rows.length === 0 ? (
        <EmptyState icon="search" title={filtered ? 'No repositories match' : 'No repositories yet'}>
          {filtered ? 'Try another search or filter.' : 'Install the GitHub App on the organisation, then sync installations on the Connection tab.'}
        </EmptyState>
      ) : (
        <div className="table-wrap" aria-busy={repos.loading || undefined}>
          <table className="table table-stack">
            <thead>
              <tr>
                <th scope="col">Repository</th>
                <th scope="col">Project</th>
                <th scope="col">Sync</th>
                <th scope="col">Items</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="cell-primary">
                    <ExternalLink href={row.htmlUrl} className="wrap-anywhere">
                      {row.fullName}
                    </ExternalLink>
                    <div className="cluster">
                      {row.private && <span className="badge">Private</span>}
                      {row.archived && <span className="badge">Archived</span>}
                    </div>
                  </td>
                  <td data-label="Project">
                    <SelectField
                      label={<span className="visually-hidden">Project for {row.fullName}</span>}
                      value={row.project?.id ?? ''}
                      disabled={pending || row.removed || !projects.data}
                      onChange={(event) => choose(row, event.target.value)}
                    >
                      <option value="">Not mapped</option>
                      {(projects.data ?? []).map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </SelectField>
                  </td>
                  <td data-label="Sync">
                    <ToneBadge presentation={syncPresentation(row)} />
                    <div className="caption muted">{row.lastSyncedAt ? `Synced ${relativeTime(row.lastSyncedAt)}` : 'Never synced'}</div>
                    {row.lastSyncError && <div className="caption gha-error wrap-anywhere">{row.lastSyncError}</div>}
                  </td>
                  <td data-label="Items">{row.itemCount}</td>
                  <td data-label="Actions">
                    {row.project && !row.removed ? (
                      <div className="cluster">
                        <Button size="sm" busy={act.busy === `sync:${row.id}`} disabled={pending} onClick={() => void mutate(`sync:${row.id}`, () => github.syncRepository(row.id))}>
                          Sync now
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          busy={act.busy === `full:${row.id}`}
                          disabled={pending}
                          onClick={() => void mutate(`full:${row.id}`, () => github.syncRepository(row.id, true))}
                        >
                          Full resync
                        </Button>
                      </div>
                    ) : (
                      <span className="muted">{row.removed ? 'No access' : 'Map it to start syncing'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={unmapping !== null}
        title="Stop syncing this repository?"
        confirmLabel="Unmap repository"
        tone="danger"
        busy={pending}
        problem={act.problem}
        onConfirm={() => void confirmUnmap()}
        onClose={() => setUnmapping(null)}
      >
        <p>
          {unmapping?.fullName} will no longer appear on {unmapping?.project?.name ?? 'its project'}. Its items stay in the portal and return if you map it again.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
