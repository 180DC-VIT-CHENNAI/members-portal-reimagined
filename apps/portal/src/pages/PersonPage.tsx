import { useEffect, useState } from 'react';
import { ConversationButton } from '../components/messages/ConversationButton.tsx';
import { Alert, Avatar, BackLink, ErrorState, LoadingBlock, StatusBadge, useTitle } from '../components/ui.tsx';
import { api, lookups, useLoad } from '../lib/api.ts';
import { lookupName } from '../lib/format.ts';
import { useSession } from '../lib/session.tsx';
import type { Department, Position, Term } from '../lib/types.ts';
import { ProfileCard } from './person/ProfileCard.tsx';
import { TenureCard } from './person/TenureCard.tsx';
import { StatusCard } from './person/StatusCard.tsx';
import { AccessCard } from './person/AccessCard.tsx';
import { MembershipsCard } from './person/MembershipsCard.tsx';
import { OffboardCard } from './person/OffboardCard.tsx';
import { PromotionsCard } from './person/PromotionsCard.tsx';
import { StatusHistoryCard } from './person/StatusHistoryCard.tsx';

export function PersonPage({ id }: { id: string }) {
  const session = useSession();
  const person = useLoad(() => api('/api/people/:id', { params: { id } }), [id]);
  const [departments, setDepartments] = useState<Department[]>();
  const [positions, setPositions] = useState<Position[]>();
  const [terms, setTerms] = useState<Term[]>();
  useEffect(() => {
    void lookups.departments().then(setDepartments, () => {});
    void lookups.positions().then(setPositions, () => {});
    void lookups.terms().then(setTerms, () => {});
  }, []);
  useTitle(person.data?.fullName ?? 'Person');

  if (person.problem) {
    return (
      <div className="page">
        <ErrorState problem={person.problem} onRetry={person.reload} />
      </div>
    );
  }
  if (!person.data) {
    return (
      <div className="page">
        <LoadingBlock rows={8} />
      </div>
    );
  }

  const p = person.data;
  const self = p.id === session.me.id;
  const dept = lookupName(departments, p.departmentId, (d) => d.name);
  const current = p.tenures.filter((t) => !t.endedOn && terms?.find((term) => term.id === t.termId)?.isCurrent);
  const reload = () => {
    person.reload();
    if (self) session.refresh();
  };

  return (
    <div className="page">
      {session.can('people.view') && <BackLink to="/people">Directory</BackLink>}
      <div className="person-layout">
        <aside className="person-aside">
          <div className="card">
            <div className="card-inner profile-summary">
              <Avatar name={p.fullName} photo={p.photoKey} size={88} />
              <h1>{p.fullName}</h1>
              <p className="muted wrap-anywhere">{p.email}</p>
              <StatusBadge status={p.status} />
              {!self && (p.status === 'active' || p.status === 'on_leave') && <ConversationButton target={{ personId: p.id }} />}
              <dl className="summary-list">
                <div>
                  <dt>Department</dt>
                  <dd>{dept ?? 'Club-wide'}</dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>{current.map((t) => t.title).join(', ') || 'None this term'}</dd>
                </div>
                <div>
                  <dt>Access role</dt>
                  <dd>{p.accessRoleId}</dd>
                </div>
              </dl>
            </div>
          </div>
        </aside>
        <div className="stack">
          <ProfileCard person={p} self={self} departments={departments} onSaved={(next) => (self ? reload() : person.setData(next))} />
          <TenureCard person={p} positions={positions} terms={terms} departments={departments} onChanged={person.reload} />
          <MembershipsCard person={p} departments={departments} onChanged={person.reload} />
          <PromotionsCard person={p} positions={positions} terms={terms} onChanged={person.reload} />
          {!self && session.can('people.lifecycle', p.departmentId) && <StatusCard person={p} onChanged={person.reload} />}
          {!self && p.status !== 'removed' && session.can('people.offboard', p.departmentId) && <OffboardCard person={p} onChanged={person.reload} />}
          {(self || session.can('people.lifecycle', p.departmentId)) && <StatusHistoryCard personId={p.id} version={`${p.status}:${p.statusChangedAt}`} />}
          {!self && session.can('people.grants') && p.grants && <AccessCard person={p} grants={p.grants} departments={departments} onChanged={person.reload} />}
          {self && (
            <Alert tone="info" title="Your access">
              Your status and access role can only be changed by someone else with permission.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
