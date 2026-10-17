import { useState } from 'react';
import { api } from '../../lib/api.ts';
import type { Group, Instance, Placeable, Team } from '../../lib/team-client.ts';
import { Button, Card, ConfirmDialog, EmptyState } from '../ui.tsx';
import { TeamCard } from './TeamCard.tsx';
import { AddTeamDialog, GroupDialog } from './TeamForms.tsx';
import { useAction } from './use-action.ts';

interface BoardProps {
  readonly instance: Instance;
  readonly people: readonly Placeable[];
  readonly onChange: () => void;
}

/** Teams by group, then teams in no group; those running the instance add teams and groups from the toolbar. */
export function StaffingBoard({ instance, people, onChange }: BoardProps) {
  const [adding, setAdding] = useState<'team' | 'group' | null>(null);
  const label = instance.groupLabel.toLowerCase();
  const empty = instance.groups.length === 0 && instance.ungroupedTeams.length === 0;
  return (
    <div className="stack">
      {instance.access.staff && (
        <div className="cluster">
          <Button variant="primary" icon="plus" onClick={() => setAdding('team')}>
            Add team
          </Button>
          <Button icon="plus" onClick={() => setAdding('group')}>
            Add {label}
          </Button>
        </div>
      )}
      {empty && (
        <EmptyState icon="trophy" title="No teams yet">
          {instance.access.staff ? 'Add the first team with the button above.' : 'Teams appear here once they are set up.'}
        </EmptyState>
      )}
      {instance.groups.map((group) => (
        <GroupCard key={group.id} instance={instance} group={group} people={people} onChange={onChange} />
      ))}
      {instance.ungroupedTeams.length > 0 && (
        <Card title={instance.groups.length ? `No ${label}` : 'Teams'}>
          <TeamGrid instance={instance} teams={instance.ungroupedTeams} people={people} onChange={onChange} />
        </Card>
      )}
      {adding === 'team' && <AddTeamDialog instance={instance} onAdded={onChange} onClose={() => setAdding(null)} />}
      {adding === 'group' && (
        <GroupDialog
          instance={instance}
          group={null}
          onSaved={() => {
            setAdding(null);
            onChange();
          }}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

function TeamGrid({ instance, teams, people, onChange }: BoardProps & { readonly teams: readonly Team[] }) {
  if (teams.length === 0) return <p className="caption muted">No teams yet.</p>;
  return (
    <div className="instance-team-grid">
      {teams.map((team) => (
        <TeamCard key={team.id} instance={instance} team={team} people={people} onChange={onChange} />
      ))}
    </div>
  );
}

function GroupCard({ instance, group, people, onChange }: BoardProps & { readonly group: Group }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { busy, problem, setProblem, run } = useAction(onChange);
  const label = instance.groupLabel.toLowerCase();
  return (
    <Card
      title={group.name}
      description={[group.organization, group.description].filter(Boolean).join(' · ') || undefined}
      actions={
        instance.access.staff && (
          <>
            <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="danger-quiet"
              icon="trash"
              onClick={() => {
                setProblem(null);
                setDeleting(true);
              }}
            >
              Delete
            </Button>
          </>
        )
      }
    >
      <TeamGrid instance={instance} teams={group.teams} people={people} onChange={onChange} />
      {editing && (
        <GroupDialog
          instance={instance}
          group={group}
          onSaved={() => {
            setEditing(false);
            onChange();
          }}
          onClose={() => setEditing(false)}
        />
      )}
      <ConfirmDialog
        open={deleting}
        title={`Delete the ${label} "${group.name}"?`}
        confirmLabel={`Delete ${label}`}
        tone="danger"
        busy={busy === 'delete'}
        problem={problem}
        onConfirm={() =>
          void run('delete', () => api('/api/team-instances/:id/groups/:groupId', { method: 'DELETE', params: { id: instance.id, groupId: group.id } })).then(
            (done) => done && setDeleting(false),
          )
        }
        onClose={() => setDeleting(false)}
      >
        <p>Its teams and everyone on them stay, under "No {label}".</p>
      </ConfirmDialog>
    </Card>
  );
}
