import { useState } from 'react';
import { lookups, useLoad } from '../../lib/api.ts';
import { allTeams, type Instance, levelName, TEAM_STATUS_LABEL } from '../../lib/team-client.ts';
import { Card, EmptyState, SearchField, SelectField } from '../ui.tsx';

const OUTSIDE = 'outside';

/** Everyone on a team, one row per placement, so someone on two teams appears twice. */
export function RosterView({ instance }: { readonly instance: Instance }) {
  const departments = useLoad(() => lookups.departments(), []);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const groupOf = new Map(instance.groups.flatMap((group) => group.teams.map((team) => [team.id, group.name] as const)));
  const departmentName = (id: string | null) => (id ? (departments.data?.find((d) => d.id === id)?.name ?? null) : null);
  const rows = allTeams(instance).flatMap((team) => team.members.map((member) => ({ key: `${team.id}:${member.kind}:${member.id}`, team, member })));
  const departmentIds = [...new Set(rows.flatMap(({ member }) => (member.kind === 'person' && member.departmentId ? [member.departmentId] : [])))];
  const hasOutside = rows.some(({ member }) => member.kind === 'external');
  const needle = query.trim().toLowerCase();
  const shown = rows.filter(({ team, member }) => {
    if (department === OUTSIDE && member.kind !== 'external') return false;
    if (department && department !== OUTSIDE && (member.kind !== 'person' || member.departmentId !== department)) return false;
    return !needle || `${member.name} ${team.name} ${groupOf.get(team.id) ?? ''}`.toLowerCase().includes(needle);
  });
  const grouped = instance.groups.length > 0;

  if (rows.length === 0) return <EmptyState icon="users" title="Nobody is on a team yet" />;
  return (
    <div className="stack">
      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <SearchField label="Search" placeholder={grouped ? `Name, team or ${instance.groupLabel.toLowerCase()}` : 'Name or team'} value={query} onChange={(e) => setQuery(e.target.value)} />
        {(departmentIds.length > 1 || (departmentIds.length > 0 && hasOutside)) && (
          <SelectField label="From" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Everyone</option>
            {departmentIds.map((id) => (
              <option key={id} value={id}>
                {departmentName(id) ?? 'Department'}
              </option>
            ))}
            {hasOutside && <option value={OUTSIDE}>Outside people</option>}
          </SelectField>
        )}
      </form>
      {shown.length === 0 ? (
        <EmptyState title="Nobody matches">Try another search or filter.</EmptyState>
      ) : (
        <Card flush>
          <div className="table-wrap">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Team</th>
                  {grouped && <th scope="col">{instance.groupLabel}</th>}
                  <th scope="col">From</th>
                  <th scope="col">Level</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ key, team, member }) => (
                  <tr key={key}>
                    <td className="cell-primary">{member.name}</td>
                    <td data-label="Team">{team.name}</td>
                    {grouped && <td data-label={instance.groupLabel}>{groupOf.get(team.id) ?? '—'}</td>}
                    <td data-label="From">
                      {member.kind === 'person' ? (departmentName(member.departmentId) ?? '—') : ['Outside', member.organization].filter(Boolean).join(' · ')}
                    </td>
                    <td data-label="Level">
                      {levelName(instance, team.currentLevel)}
                      {team.status !== 'active' && ` · ${TEAM_STATUS_LABEL[team.status]}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="caption muted">
        {shown.length === rows.length ? `${rows.length} placements` : `${shown.length} of ${rows.length} placements`}. Someone on two teams is listed twice.
      </p>
    </div>
  );
}
