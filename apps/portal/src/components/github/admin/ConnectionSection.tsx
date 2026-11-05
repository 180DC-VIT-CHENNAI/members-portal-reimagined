import { relativeTime } from '../../../lib/format.ts';
import { github } from '../../../lib/github-client.ts';
import { configErrorText, installationPresentation, setupChecklist } from '../../../lib/github-view.ts';
import type { GitHubStatusResponse } from '../../../server/github/types.ts';
import { Icon } from '../../icons.tsx';
import { Alert, Button, Card, cx, EmptyState, ProblemAlert } from '../../ui.tsx';
import { ToneBadge } from '../parts.tsx';
import { useAction } from '../use-action.ts';

interface ConnectionSectionProps {
  readonly status: GitHubStatusResponse;
  readonly onChanged: (status: GitHubStatusResponse) => void;
}

export function ConnectionSection({ status, onChanged }: ConnectionSectionProps) {
  const sync = useAction();
  const steps = setupChecklist(status);

  const refresh = async () => {
    const result = await sync.run('sync', () => github.syncInstallations());
    if (result.ok) onChanged(result.value);
  };

  return (
    <div className="stack">
      {status.configError && (
        <Alert tone="error" title="The GitHub App settings are not valid.">
          {configErrorText(status.configError)}
        </Alert>
      )}
      <Card title="Setup" description={`Connected organisation: ${status.org}`}>
        <ul className="gha-checklist">
          {steps.map((step) => (
            <li key={step.key} className={cx('gha-step', step.done ? 'is-done' : 'is-todo')}>
              <Icon name={step.done ? 'checkCircle' : 'alert'} size={18} />
              <span>
                <span className="visually-hidden">{step.done ? 'Done: ' : 'To do: '}</span>
                {step.label}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Health">
        <dl className="gha-stats">
          <div className="gha-stat">
            <dt>Repositories</dt>
            <dd>{status.repositories.total}</dd>
            <span className="caption muted">{status.repositories.mapped} mapped</span>
          </div>
          <div className="gha-stat">
            <dt>Failing syncs</dt>
            <dd>{status.repositories.failing}</dd>
          </div>
          <div className="gha-stat">
            <dt>Last webhook</dt>
            <dd>{status.deliveries.lastReceivedAt ? relativeTime(status.deliveries.lastReceivedAt) : 'Never'}</dd>
          </div>
          <div className="gha-stat">
            <dt>Failed deliveries, last 24 hours</dt>
            <dd>{status.deliveries.failedLast24h}</dd>
          </div>
        </dl>
      </Card>
      <Card
        flush
        title="Installations"
        description="Where the GitHub App is installed."
        actions={
          <Button icon="history" busy={sync.busy === 'sync'} onClick={() => void refresh()}>
            Sync installations
          </Button>
        }
      >
        <div className="gha-pad">
          <ProblemAlert problem={sync.problem} />
        </div>
        {status.installations.length === 0 ? (
          <EmptyState icon="globe" title="The App is not installed yet">
            Install the GitHub App on the organisation, then sync installations.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Access</th>
                  <th scope="col">State</th>
                  <th scope="col">Repositories synced</th>
                  <th scope="col">Permissions</th>
                </tr>
              </thead>
              <tbody>
                {status.installations.map((installation) => (
                  <tr key={installation.id}>
                    <td className="cell-primary">{installation.accountLogin}</td>
                    <td data-label="Access">{installation.repositorySelection === 'all' ? 'All repositories' : 'Selected repositories'}</td>
                    <td data-label="State">
                      <ToneBadge presentation={installationPresentation(installation)} />
                    </td>
                    <td data-label="Repositories synced">{installation.reposSyncedAt ? relativeTime(installation.reposSyncedAt) : 'Never'}</td>
                    <td data-label="Permissions">
                      {installation.missingPermissions.length === 0 ? 'All granted' : <span className="gha-error">Missing: {installation.missingPermissions.join(', ')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
