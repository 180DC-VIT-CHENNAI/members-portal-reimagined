import { type FormEvent, useState } from 'react';
import { api } from '../../lib/api.ts';
import { allTeams, type Group, type Instance, type Placement, type Team } from '../../lib/team-client.ts';
import { Alert, Button, Dialog, ProblemAlert, SelectField, TextAreaField, TextField } from '../ui.tsx';
import { useAction } from './use-action.ts';

/** A size field's value: empty means no limit. */
export const parseSize = (value: string): number | null => (value.trim() === '' ? null : Number(value));

export function SizeFields({ min, max, onMin, onMax }: { min: string; max: string; onMin: (value: string) => void; onMax: (value: string) => void }) {
  return (
    <>
      <TextField label="Minimum" type="number" inputMode="numeric" min={1} max={500} optional value={min} onChange={(e) => onMin(e.target.value)} hint="Teams below it are flagged." />
      <TextField label="Maximum" type="number" inputMode="numeric" min={1} max={500} optional value={max} onChange={(e) => onMax(e.target.value)} hint="Counts members and outside people." />
    </>
  );
}

export function GroupField({ instance, value, onChange }: { instance: Instance; value: string; onChange: (groupId: string) => void }) {
  return (
    <SelectField label={instance.groupLabel} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No {instance.groupLabel.toLowerCase()}</option>
      {instance.groups.map((group) => (
        <option key={group.id} value={group.id}>
          {group.name}
        </option>
      ))}
    </SelectField>
  );
}

interface EditorProps {
  readonly instance: Instance;
  readonly onSaved: () => void;
  readonly onClose: () => void;
}

export function TeamEditor({ instance, team, onSaved, onClose }: EditorProps & { readonly team: Team }) {
  const [name, setName] = useState(team.name);
  const [groupId, setGroupId] = useState(team.groupId ?? '');
  const [description, setDescription] = useState(team.description ?? '');
  const [min, setMin] = useState(team.minMembers === null ? '' : String(team.minMembers));
  const [max, setMax] = useState(team.maxMembers === null ? '' : String(team.maxMembers));
  const { busy, problem, run } = useAction(onSaved);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run('save', () =>
      api('/api/team-instances/:id/teams/:teamId', {
        method: 'PATCH',
        params: { id: instance.id, teamId: team.id },
        body: { name, groupId: groupId || null, description: description.trim() || null, minMembers: parseSize(min), maxMembers: parseSize(max) },
      }),
    );
  };
  return (
    <Dialog open title="Edit team" onClose={busy ? () => {} : onClose}>
      <form className="form" onSubmit={submit}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={problem?.fields.name} required maxLength={255} />
        <GroupField instance={instance} value={groupId} onChange={setGroupId} />
        <TextAreaField label="Description" optional value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} />
        <div className="form-grid">
          <SizeFields min={min} max={max} onMin={setMin} onMax={setMax} />
        </div>
        <ProblemAlert problem={problem} fieldsShown={['name']} />
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy === 'save'} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Add a group, or edit `group`. */
export function GroupDialog({ instance, group, onSaved, onClose }: EditorProps & { readonly group: Group | null }) {
  const label = instance.groupLabel.toLowerCase();
  const [name, setName] = useState(group?.name ?? '');
  const [organization, setOrganization] = useState(group?.organization ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const { busy, problem, run } = useAction(onSaved);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = { name, organization: organization.trim() || null, description: description.trim() || null };
    void run('save', () =>
      group
        ? api('/api/team-instances/:id/groups/:groupId', { method: 'PATCH', params: { id: instance.id, groupId: group.id }, body })
        : api('/api/team-instances/:id/groups', { method: 'POST', params: { id: instance.id }, body }),
    );
  };
  return (
    <Dialog open title={group ? `Edit ${label}` : `New ${label}`} onClose={busy ? () => {} : onClose}>
      <form className="form" onSubmit={submit}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={problem?.fields.name} required maxLength={255} />
        <TextField label="Organisation" optional value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={200} />
        <TextAreaField label="Description" optional value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} />
        <ProblemAlert problem={problem} fieldsShown={['name']} />
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy === 'save'} disabled={!name.trim()}>
            {group ? 'Save' : `Add ${label}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Add teams one after another: the dialog stays open, keeps the group and sizes, and confirms each team. */
export function AddTeamDialog({ instance, onAdded, onClose }: { readonly instance: Instance; readonly onAdded: () => void; readonly onClose: () => void }) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [added, setAdded] = useState<string | null>(null);
  const { busy, problem, run } = useAction(onAdded);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = { name, groupId: groupId || null, minMembers: parseSize(min), maxMembers: parseSize(max) };
    if (await run('add', () => api('/api/team-instances/:id/teams', { method: 'POST', params: { id: instance.id }, body }))) {
      setAdded(name.trim());
      setName('');
    }
  };
  return (
    <Dialog open title="Add teams" onClose={busy ? () => {} : onClose}>
      <form className="form" onSubmit={submit}>
        <TextField
          label="Team name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setAdded(null);
          }}
          error={problem?.fields.name}
          required
          maxLength={255}
        />
        {instance.groups.length > 0 && <GroupField instance={instance} value={groupId} onChange={setGroupId} />}
        <div className="form-grid">
          <SizeFields min={min} max={max} onMin={setMin} onMax={setMax} />
        </div>
        {added && <Alert tone="success">Added "{added}". Add another, or choose Done.</Alert>}
        <ProblemAlert problem={problem} fieldsShown={['name']} />
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
            {added ? 'Done' : 'Cancel'}
          </Button>
          <Button type="submit" variant="primary" icon="plus" busy={busy === 'add'} disabled={!name.trim()}>
            Add team
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Choose another team for someone; full teams are listed but cannot be chosen. */
export function MoveDialog({ instance, team, member, onSaved, onClose }: EditorProps & { readonly team: Team; readonly member: Placement }) {
  const others = allTeams(instance).filter((other) => other.id !== team.id);
  const [target, setTarget] = useState(others.find((other) => !other.full)?.id ?? '');
  const { busy, problem, run } = useAction(onSaved);
  const groupOf = (teamId: string) => instance.groups.find((group) => group.teams.some((t) => t.id === teamId))?.name;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run('move', () =>
      api('/api/team-instances/:id/move', {
        method: 'POST',
        params: { id: instance.id },
        body: { kind: member.kind, memberId: member.id, fromTeamId: team.id, toTeamId: target },
      }),
    );
  };
  return (
    <Dialog open title={`Move ${member.name}`} onClose={busy ? () => {} : onClose}>
      <form className="form" onSubmit={submit}>
        <SelectField label="To team" value={target} onChange={(e) => setTarget(e.target.value)}>
          {others.map((other) => {
            const group = groupOf(other.id);
            return (
              <option key={other.id} value={other.id} disabled={other.full}>
                {group ? `${other.name} (${group})` : other.name}
                {other.full ? ' - full' : ''}
              </option>
            );
          })}
        </SelectField>
        <ProblemAlert problem={problem} />
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy === 'move'} disabled={!target}>
            Move
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
