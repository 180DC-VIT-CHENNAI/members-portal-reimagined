import { api } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { allTeams, type Instance, levelName, type Team, TEAM_STATUS_LABEL, TEAM_STATUS_TONE, type TeamStatus } from '../../lib/team-client.ts';
import { Button, EmptyState, ProblemAlert } from '../ui.tsx';
import { useAction } from './use-action.ts';

type Step = { currentLevel?: number; status?: TeamStatus };

/** Teams by the level they have reached; those running the instance advance, eliminate or crown them. */
export function LevelBoard({ instance, onChange }: { readonly instance: Instance; readonly onChange: () => void }) {
  const teams = allTeams(instance);
  const { busy, problem, run } = useAction(onChange);
  const staff = instance.access.staff;
  const top = instance.levels.length;
  const groupOf = new Map(instance.groups.flatMap((group) => group.teams.map((team) => [team.id, group.name] as const)));
  const step = (team: Team, key: string, body: Step) =>
    void run(`${team.id}:${key}`, () => api('/api/team-instances/:id/teams/:teamId', { method: 'PATCH', params: { id: instance.id, teamId: team.id }, body }));

  if (teams.length === 0) {
    return (
      <EmptyState icon="trophy" title="No teams yet">
        Teams appear here, by level, once they are added under Staffing.
      </EmptyState>
    );
  }
  const { stats } = instance;
  const summary = [`${plural(stats.active, 'team')} still in`, stats.eliminated ? `${stats.eliminated} eliminated` : null, stats.winners ? plural(stats.winners, 'winner') : null];
  return (
    <div className="stack">
      <p className="caption muted">{summary.filter(Boolean).join(' · ')}</p>
      <ProblemAlert problem={problem} />
      <div className="level-board">
        {instance.levels.map((level) => {
          const here = teams.filter((team) => team.currentLevel === level.position);
          const headingId = `level-${instance.id}-${level.position}`;
          return (
            <section key={level.position} className="level-column" aria-labelledby={headingId}>
              <header className="row-between">
                <h3 id={headingId}>{level.name}</h3>
                <span className="caption muted">{plural(here.length, 'team')}</span>
              </header>
              {here.length === 0 ? (
                <p className="caption muted">No teams at this level.</p>
              ) : (
                <ul className="level-teams">
                  {here.map((team) => {
                    const group = groupOf.get(team.id);
                    const key = (action: string) => `${team.id}:${action}`;
                    const pending = (action: string) => ({ busy: busy === key(action), disabled: busy !== null && busy !== key(action) });
                    return (
                      <li key={team.id} className="level-team" data-status={team.status}>
                        <div className="row-between">
                          <span className="level-team-name">{team.name}</span>
                          {team.status !== 'active' && <span className={`badge ${TEAM_STATUS_TONE[team.status]}`}>{TEAM_STATUS_LABEL[team.status]}</span>}
                        </div>
                        <span className="caption muted">{[group, plural(team.count, 'person', 'people')].filter(Boolean).join(' · ')}</span>
                        {staff && (
                          <div className="cluster">
                            {team.status !== 'active' ? (
                              <Button size="sm" {...pending('reinstate')} aria-label={`Reinstate ${team.name}`} onClick={() => step(team, 'reinstate', { status: 'active' })}>
                                Reinstate
                              </Button>
                            ) : (
                              <>
                                {level.position < top ? (
                                  <Button
                                    size="sm"
                                    {...pending('advance')}
                                    aria-label={`Advance ${team.name} to ${levelName(instance, level.position + 1)}`}
                                    onClick={() => step(team, 'advance', { currentLevel: level.position + 1 })}
                                  >
                                    Advance
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="primary" icon="trophy" {...pending('winner')} aria-label={`Mark ${team.name} the winner`} onClick={() => step(team, 'winner', { status: 'winner' })}>
                                    Winner
                                  </Button>
                                )}
                                <Button size="sm" variant="danger-quiet" {...pending('eliminate')} aria-label={`Eliminate ${team.name}`} onClick={() => step(team, 'eliminate', { status: 'eliminated' })}>
                                  Eliminate
                                </Button>
                                {level.position > 1 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    {...pending('back')}
                                    aria-label={`Move ${team.name} back to ${levelName(instance, level.position - 1)}`}
                                    onClick={() => step(team, 'back', { currentLevel: level.position - 1 })}
                                  >
                                    Back
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
