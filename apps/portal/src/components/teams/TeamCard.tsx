import { type FormEvent, useState } from 'react';
import { api } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { allTeams, type Instance, levelName, type Placeable, type Placement, type Team, TEAM_STATUS_LABEL, TEAM_STATUS_TONE } from '../../lib/team-client.ts';
import { Avatar, Button, ConfirmDialog, ProblemAlert, SelectField } from '../ui.tsx';
import { MoveDialog, TeamEditor } from './TeamForms.tsx';
import { useAction } from './use-action.ts';

interface Candidate {
  readonly key: string;
  readonly kind: Placement['kind'];
  readonly id: string;
  readonly label: string;
}

function place(instance: Instance, team: Team, candidate: Candidate) {
  const params = { id: instance.id, teamId: team.id };
  switch (candidate.kind) {
    case 'person':
      return api('/api/team-instances/:id/teams/:teamId/members', { method: 'POST', params, body: { personId: candidate.id } });
    case 'external':
      return api('/api/team-instances/:id/teams/:teamId/externals', { method: 'POST', params, body: { externalId: candidate.id } });
    default: {
      const unhandled: never = candidate.kind;
      throw new Error(`Unhandled placement kind: ${String(unhandled)}`);
    }
  }
}

function unplace(instance: Instance, team: Team, member: Placement) {
  const params = { id: instance.id, teamId: team.id };
  switch (member.kind) {
    case 'person':
      return api('/api/team-instances/:id/teams/:teamId/members/:personId', { method: 'DELETE', params: { ...params, personId: member.id } });
    case 'external':
      return api('/api/team-instances/:id/teams/:teamId/externals/:externalId', { method: 'DELETE', params: { ...params, externalId: member.id } });
    default: {
      const unhandled: never = member;
      throw new Error(`Unhandled placement: ${String(unhandled)}`);
    }
  }
}

const sizeLabel = (team: Team) => (team.maxMembers === null ? plural(team.count, 'person', 'people') : `${team.count} of ${team.maxMembers}`);

/** One team: who is on it and its size, with staffing controls for those running the instance. */
export function TeamCard({ instance, team, people, onChange }: { instance: Instance; team: Team; people: readonly Placeable[]; onChange: () => void }) {
  const staff = instance.access.staff;
  const { busy, problem, setProblem, run } = useAction(onChange);
  const [choice, setChoice] = useState('');
  const [moving, setMoving] = useState<Placement | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const onTeam = new Set(team.members.map((member) => `${member.kind}:${member.id}`));
  const candidates: Candidate[] = [
    ...people.filter((p) => !onTeam.has(`person:${p.id}`)).map((p) => ({ key: `person:${p.id}`, kind: 'person' as const, id: p.id, label: p.fullName })),
    ...instance.externals
      .filter((e) => !onTeam.has(`external:${e.id}`))
      .map((e) => ({ key: `external:${e.id}`, kind: 'external' as const, id: e.id, label: e.organization ? `${e.name} (${e.organization})` : e.name })),
  ];
  const chosen = candidates.find((candidate) => candidate.key === choice);
  const hasOtherTeams = allTeams(instance).length > 1;
  const open = (action: () => void) => {
    setProblem(null);
    action();
  };
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (chosen && (await run('add', () => place(instance, team, chosen)))) setChoice('');
  };

  return (
    <article className="instance-team" aria-labelledby={`team-${team.id}`}>
      <header className="row-between">
        <div className="instance-team-title">
          <h3 id={`team-${team.id}`}>{team.name}</h3>
          <span className="caption muted">{levelName(instance, team.currentLevel)}</span>
        </div>
        <div className="cluster">
          {team.status !== 'active' && <span className={`badge ${TEAM_STATUS_TONE[team.status]}`}>{TEAM_STATUS_LABEL[team.status]}</span>}
          {team.short && team.minMembers !== null && <span className="badge badge-warning">Needs {team.minMembers - team.count} more</span>}
          <span className="badge">{sizeLabel(team)}</span>
        </div>
      </header>
      {team.description && <p className="caption pre-wrap">{team.description}</p>}
      {team.members.length === 0 ? (
        <p className="caption muted">Nobody on this team yet.</p>
      ) : (
        <ul className="placement-list">
          {team.members.map((member) => {
            const key = `${member.kind}:${member.id}`;
            return (
              <li key={key}>
                <span className="person-cell">
                  <Avatar name={member.name} photo={member.kind === 'person' ? member.photoKey : null} size={28} />
                  <span className="person-cell-text">
                    <span>{member.name}</span>
                    {member.kind === 'external' && <span className="caption muted">Outside{member.organization ? ` · ${member.organization}` : ''}</span>}
                  </span>
                </span>
                {staff && (
                  <span className="cluster">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="arrowRightLeft"
                      className="btn-icon"
                      disabled={!hasOtherTeams || busy !== null}
                      title="Move to another team"
                      aria-label={`Move ${member.name}`}
                      onClick={() => open(() => setMoving(member))}
                    />
                    <Button
                      size="sm"
                      variant="danger-quiet"
                      icon="x"
                      className="btn-icon"
                      busy={busy === key}
                      disabled={busy !== null && busy !== key}
                      title="Take off this team"
                      aria-label={`Remove ${member.name} from ${team.name}`}
                      onClick={() => void run(key, () => unplace(instance, team, member))}
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {staff && (
        <form className="instance-team-add" onSubmit={add}>
          <SelectField label="Add someone" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={team.full}>
            <option value="">{team.full ? 'Team is full' : 'Choose one'}</option>
            {candidates.some((c) => c.kind === 'person') && (
              <optgroup label="Members">
                {candidates
                  .filter((c) => c.kind === 'person')
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
              </optgroup>
            )}
            {candidates.some((c) => c.kind === 'external') && (
              <optgroup label="Outside people">
                {candidates
                  .filter((c) => c.kind === 'external')
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
              </optgroup>
            )}
          </SelectField>
          <Button type="submit" icon="userPlus" busy={busy === 'add'} disabled={!chosen || team.full}>
            Add
          </Button>
        </form>
      )}
      <ProblemAlert problem={moving || editing || deleting ? null : problem} />
      {staff && (
        <div className="cluster">
          <Button size="sm" variant="ghost" icon="pencil" onClick={() => open(() => setEditing(true))}>
            Edit
          </Button>
          <Button size="sm" variant="danger-quiet" icon="trash" onClick={() => open(() => setDeleting(true))}>
            Delete
          </Button>
        </div>
      )}
      {moving && (
        <MoveDialog
          instance={instance}
          team={team}
          member={moving}
          onSaved={() => {
            setMoving(null);
            onChange();
          }}
          onClose={() => setMoving(null)}
        />
      )}
      {editing && (
        <TeamEditor
          instance={instance}
          team={team}
          onSaved={() => {
            setEditing(false);
            onChange();
          }}
          onClose={() => setEditing(false)}
        />
      )}
      <ConfirmDialog
        open={deleting}
        title={`Delete "${team.name}"?`}
        confirmLabel="Delete team"
        tone="danger"
        busy={busy === 'delete'}
        problem={deleting ? problem : null}
        onConfirm={() =>
          void run('delete', () => api('/api/team-instances/:id/teams/:teamId', { method: 'DELETE', params: { id: instance.id, teamId: team.id } })).then(
            (done) => done && setDeleting(false),
          )
        }
        onClose={() => setDeleting(false)}
      >
        <p>{team.count ? `${plural(team.count, 'person', 'people')} come off it. ` : ''}Outside people stay in the register.</p>
      </ConfirmDialog>
    </article>
  );
}
