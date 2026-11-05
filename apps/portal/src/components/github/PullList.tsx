import { useState } from 'react';
import { useLoad } from '../../lib/api.ts';
import { github } from '../../lib/github-client.ts';
import { repoName } from '../../lib/github-view.ts';
import type { ProjectGitHubResponse } from '../../server/github/types.ts';
import { EmptyState, ErrorState, LoadingBlock, SelectField } from '../ui.tsx';
import { ItemRow } from './ItemRow.tsx';

type PullState = 'open' | 'closed' | 'all';

const STATES: readonly { readonly value: PullState; readonly label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed or merged' },
  { value: 'all', label: 'All' },
];

export function PullList({ projectId, info }: { projectId: string; info: ProjectGitHubResponse }) {
  const [state, setState] = useState<PullState>('open');
  const [repo, setRepo] = useState('');
  const [mine, setMine] = useState(false);
  const pulls = useLoad(() => github.pulls(projectId, { state, ...(repo ? { repo } : {}), ...(mine ? { author: 'me' as const } : {}) }), [projectId, state, repo, mine]);
  const filtered = state !== 'open' || repo !== '' || mine;

  return (
    <div className="gh-section">
      <form className="filters gh-pad" role="search" aria-label="Filter pull requests" onSubmit={(event) => event.preventDefault()}>
        <SelectField label="State" value={state} onChange={(event) => setState(STATES.find((option) => option.value === event.target.value)?.value ?? 'open')}>
          {STATES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        {info.repositories.length > 1 && (
          <SelectField label="Repository" value={repo} onChange={(event) => setRepo(event.target.value)}>
            <option value="">All repositories</option>
            {info.repositories.map((repository) => (
              <option key={repository.id} value={String(repository.id)}>
                {repoName(repository.fullName)}
              </option>
            ))}
          </SelectField>
        )}
        <label className="check">
          <input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} />
          Only mine
        </label>
      </form>
      {!pulls.data ? (
        pulls.problem ? (
          <div className="gh-pad">
            <ErrorState problem={pulls.problem} onRetry={pulls.reload} />
          </div>
        ) : (
          <div className="gh-pad">
            <LoadingBlock rows={3} label="Loading pull requests" />
          </div>
        )
      ) : pulls.data.pulls.length === 0 ? (
        <div className="gh-pad">
          <EmptyState icon="search" title={filtered ? 'No pull requests match these filters' : 'No open pull requests'}>
            {filtered ? 'Try another state or clear the filters.' : 'Pull requests from the mapped repositories appear here after the first sync.'}
          </EmptyState>
        </div>
      ) : (
        <ul className="gh-rows" aria-busy={pulls.loading || undefined}>
          {pulls.data.pulls.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
