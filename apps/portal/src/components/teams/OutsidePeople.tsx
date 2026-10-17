import { type FormEvent, useState } from 'react';
import { api } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import type { External, Instance } from '../../lib/team-client.ts';
import { Avatar, Button, Card, ConfirmDialog, Dialog, EmptyState, ProblemAlert, TextField } from '../ui.tsx';
import { useAction } from './use-action.ts';

/** The instance's register of people from outside the club, who can be placed on teams like members. */
export function OutsidePeople({ instance, onChange }: { readonly instance: Instance; readonly onChange: () => void }) {
  const staff = instance.access.staff;
  const [editing, setEditing] = useState<External | 'new' | null>(null);
  const [removing, setRemoving] = useState<External | null>(null);
  const { busy, problem, setProblem, run } = useAction(onChange);
  const facts = (external: External) =>
    [external.organization, external.email, external.placements ? `on ${plural(external.placements, 'team')}` : 'not on a team'].filter(Boolean).join(' · ');

  return (
    <Card
      title="Outside people"
      description="People from outside the club, such as client staff, who can be placed on teams."
      actions={
        staff && (
          <Button size="sm" icon="userPlus" onClick={() => setEditing('new')}>
            Add person
          </Button>
        )
      }
    >
      {instance.externals.length === 0 ? (
        <EmptyState icon="users" title="Nobody from outside yet" />
      ) : (
        <ul className="placement-list">
          {instance.externals.map((external) => (
            <li key={external.id} className="row-between">
              <span className="person-cell">
                <Avatar name={external.name} size={32} />
                <span className="person-cell-text">
                  <span>{external.name}</span>
                  <span className="caption muted">{facts(external)}</span>
                </span>
              </span>
              {staff && (
                <span className="cluster">
                  <Button size="sm" variant="ghost" icon="pencil" aria-label={`Edit ${external.name}`} onClick={() => setEditing(external)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-quiet"
                    icon="trash"
                    aria-label={`Remove ${external.name}`}
                    onClick={() => {
                      setProblem(null);
                      setRemoving(external);
                    }}
                  >
                    Remove
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ExternalDialog
          instance={instance}
          external={editing === 'new' ? null : editing}
          onSaved={() => {
            setEditing(null);
            onChange();
          }}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove ${removing.name}?` : ''}
        confirmLabel="Remove"
        tone="danger"
        busy={busy === 'remove'}
        problem={removing ? problem : null}
        onConfirm={() => {
          if (!removing) return;
          void run('remove', () =>
            api('/api/team-instances/:id/externals/:externalId', { method: 'DELETE', params: { id: instance.id, externalId: removing.id } }),
          ).then((done) => done && setRemoving(null));
        }}
        onClose={() => setRemoving(null)}
      >
        <p>They come off every team in this instance{removing?.placements ? ` (${plural(removing.placements, 'team')})` : ''}.</p>
      </ConfirmDialog>
    </Card>
  );
}

/** Add someone to the register, or edit `external`. Emails are optional and unique within the instance. */
function ExternalDialog({ instance, external, onSaved, onClose }: { instance: Instance; external: External | null; onSaved: () => void; onClose: () => void }) {
  const [name, setName] = useState(external?.name ?? '');
  const [email, setEmail] = useState(external?.email ?? '');
  const [organization, setOrganization] = useState(external?.organization ?? '');
  const { busy, problem, run } = useAction(onSaved);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = { name, email: email.trim() || null, organization: organization.trim() || null };
    void run('save', () =>
      external
        ? api('/api/team-instances/:id/externals/:externalId', { method: 'PATCH', params: { id: instance.id, externalId: external.id }, body })
        : api('/api/team-instances/:id/externals', { method: 'POST', params: { id: instance.id }, body }),
    );
  };
  return (
    <Dialog open title={external ? `Edit ${external.name}` : 'Add an outside person'} onClose={busy ? () => {} : onClose}>
      <form className="form" onSubmit={submit}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={problem?.fields.name} required maxLength={255} />
        <TextField label="Email" type="email" optional value={email} onChange={(e) => setEmail(e.target.value)} error={problem?.fields.email} maxLength={254} />
        <TextField label="Organisation" optional value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={200} />
        <ProblemAlert problem={problem} fieldsShown={['name', 'email']} />
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy === 'save'} disabled={!name.trim()}>
            {external ? 'Save' : 'Add person'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
