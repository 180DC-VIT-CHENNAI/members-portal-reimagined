import { type FormEvent, useState } from 'react';
import { api, useLoad } from '../../lib/api.ts';
import type { RecordType } from '../../lib/crm-client.ts';
import { Button, Card, EmptyState, ProblemAlert, SelectField } from '../ui.tsx';
import { useRun } from './use-run.ts';

const PATHS = {
  organization: '/api/crm/organizations/:id/access',
  opportunity: '/api/crm/opportunities/:id/access',
  contact: '/api/crm/contacts/:id/access',
} as const;

/** Explicit grants on one record, for its owners and CRM admins. */
export function AccessPanel({ recordType, id }: { recordType: RecordType; id: string }) {
  const path = PATHS[recordType];
  const grants = useLoad(() => api(path, { params: { id } }), [path, id]);
  const people = useLoad(() => api('/api/people', { query: { status: 'active' } }), []);
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState<'collaborator' | 'owner'>('collaborator');
  const { busy, problem, run } = useRun();
  const granted = new Set((grants.data ?? []).map((grant) => grant.personId));

  const add = (event: FormEvent) => {
    event.preventDefault();
    void run('add', () => api(path, { method: 'POST', params: { id }, body: { personId, role } }), () => {
      setPersonId('');
      grants.reload();
    });
  };
  return (
    <Card title="Access" description="Only the owner, people granted here and CRM admins can see this record. An organisation grant covers its contacts and opportunities.">
      <div className="stack">
        <form className="form" onSubmit={add}>
          <div className="form-grid">
            <SelectField label="Person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Choose someone</option>
              {(people.data ?? [])
                .filter((person) => !granted.has(person.id))
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                  </option>
                ))}
            </SelectField>
            <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value === 'owner' ? 'owner' : 'collaborator')}>
              <option value="collaborator">Collaborator</option>
              <option value="owner">Co-owner (can grant access)</option>
            </SelectField>
          </div>
          <div className="form-actions">
            <Button type="submit" variant="primary" icon="userPlus" busy={busy === 'add'} disabled={!personId}>
              Grant access
            </Button>
          </div>
        </form>
        <ProblemAlert problem={problem} />
        {grants.data && grants.data.length === 0 ? (
          <EmptyState icon="shield" title="No one else has access" />
        ) : (
          <ul className="activity-list">
            {(grants.data ?? []).map((grant) => (
              <li key={grant.id} className="cluster">
                <span className="cell-primary">{grant.fullName}</span>
                <span className="badge">{grant.role}</span>
                <Button
                  size="sm"
                  variant="danger-quiet"
                  icon="x"
                  busy={busy === grant.personId}
                  onClick={() => void run(grant.personId, () => api(path, { method: 'DELETE', params: { id }, body: { personId: grant.personId } }), grants.reload)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
