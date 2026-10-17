import {
  auditLog,
  departments,
  instanceDepartments,
  instanceExternals,
  instanceGroups,
  instanceTeamExternals,
  instanceTeamMembers,
  instanceTeams,
  people,
  type PersonStatus,
  teamInstances,
} from '@schema';
import { and, asc, db, desc, eq, sql } from 'void/db';
import { loadActivePrincipals, type Principal } from './principal';
import { canPlace, instanceAccess } from './team-instance-rules';
import type { LoadedInstance } from './team-instances';

type Placement =
  | { kind: 'person'; id: string; name: string; departmentId: string | null; photoKey: string | null; status: PersonStatus }
  | { kind: 'external'; id: string; name: string; organization: string | null };

/** Every instance the caller can see, newest first, with departments, totals and their rights. */
export async function listInstances(principal: Principal) {
  const [rows, links, teams] = await Promise.all([
    db
      .select({ id: teamInstances.id, name: teamInstances.name, description: teamInstances.description, groupLabel: teamInstances.groupLabel, createdAt: teamInstances.createdAt })
      .from(teamInstances)
      .orderBy(desc(teamInstances.createdAt), desc(teamInstances.id)),
    db
      .select({ instanceId: instanceDepartments.instanceId, id: departments.id, name: departments.name })
      .from(instanceDepartments)
      .innerJoin(departments, eq(departments.id, instanceDepartments.departmentId))
      .orderBy(asc(departments.name)),
    db
      .select({
        instanceId: instanceTeams.instanceId,
        minMembers: instanceTeams.minMembers,
        placed: sql<number>`(SELECT count(*) FROM instance_team_members m WHERE m.team_id = ${instanceTeams.id}) + (SELECT count(*) FROM instance_team_externals x WHERE x.team_id = ${instanceTeams.id})`,
      })
      .from(instanceTeams),
  ]);
  const departmentsOf = new Map<string, { id: string; name: string }[]>();
  for (const { instanceId, ...department } of links) departmentsOf.set(instanceId, [...(departmentsOf.get(instanceId) ?? []), department]);
  const totals = new Map<string, { teams: number; placements: number; short: number }>();
  for (const team of teams) {
    const total = totals.get(team.instanceId) ?? { teams: 0, placements: 0, short: 0 };
    totals.set(team.instanceId, {
      teams: total.teams + 1,
      placements: total.placements + team.placed,
      short: total.short + (team.minMembers !== null && team.placed < team.minMembers ? 1 : 0),
    });
  }
  return rows.flatMap((row) => {
    const linked = departmentsOf.get(row.id) ?? [];
    const access = instanceAccess(
      principal.permissions,
      linked.map((department) => department.id),
    );
    if (!access.view) return [];
    return [{ ...row, departments: linked, stats: totals.get(row.id) ?? { teams: 0, placements: 0, short: 0 }, access }];
  });
}

/**
 * One instance as the caller may see it: groups with their teams, teams in no
 * group, each team's people (members first, then outside people) and size
 * flags, the outside-people register (emails only for those who run it) and
 * totals. Counts are placements, so a person on two teams counts twice.
 */
export async function instanceDetail({ instance, levels, access }: LoadedInstance) {
  const instanceId = instance.id;
  const inInstance = eq(instanceTeams.instanceId, instanceId);
  const [creator, linked, groups, teams, members, outside, externals] = await Promise.all([
    instance.createdBy ? db.select({ name: people.fullName }).from(people).where(eq(people.id, instance.createdBy)) : Promise.resolve([]),
    db
      .select({ id: departments.id, name: departments.name })
      .from(instanceDepartments)
      .innerJoin(departments, eq(departments.id, instanceDepartments.departmentId))
      .where(eq(instanceDepartments.instanceId, instanceId))
      .orderBy(asc(departments.name)),
    db
      .select({ id: instanceGroups.id, name: instanceGroups.name, organization: instanceGroups.organization, description: instanceGroups.description, sortOrder: instanceGroups.sortOrder })
      .from(instanceGroups)
      .where(eq(instanceGroups.instanceId, instanceId))
      .orderBy(asc(instanceGroups.sortOrder), asc(instanceGroups.createdAt), asc(instanceGroups.id)),
    db
      .select({
        id: instanceTeams.id,
        groupId: instanceTeams.groupId,
        name: instanceTeams.name,
        description: instanceTeams.description,
        minMembers: instanceTeams.minMembers,
        maxMembers: instanceTeams.maxMembers,
        sortOrder: instanceTeams.sortOrder,
        currentLevel: instanceTeams.currentLevel,
        status: instanceTeams.status,
      })
      .from(instanceTeams)
      .where(inInstance)
      .orderBy(asc(instanceTeams.sortOrder), asc(instanceTeams.createdAt), asc(instanceTeams.id)),
    db
      .select({ teamId: instanceTeamMembers.teamId, id: people.id, name: people.fullName, departmentId: people.departmentId, photoKey: people.photoKey, status: people.status })
      .from(instanceTeamMembers)
      .innerJoin(instanceTeams, eq(instanceTeams.id, instanceTeamMembers.teamId))
      .innerJoin(people, eq(people.id, instanceTeamMembers.personId))
      .where(inInstance)
      .orderBy(asc(instanceTeamMembers.createdAt), asc(people.fullName)),
    db
      .select({ teamId: instanceTeamExternals.teamId, id: instanceExternals.id, name: instanceExternals.name, organization: instanceExternals.organization })
      .from(instanceTeamExternals)
      .innerJoin(instanceExternals, eq(instanceExternals.id, instanceTeamExternals.externalId))
      .where(eq(instanceExternals.instanceId, instanceId))
      .orderBy(asc(instanceTeamExternals.createdAt), asc(instanceExternals.name)),
    db
      .select({ id: instanceExternals.id, name: instanceExternals.name, email: instanceExternals.email, organization: instanceExternals.organization })
      .from(instanceExternals)
      .where(eq(instanceExternals.instanceId, instanceId))
      .orderBy(asc(instanceExternals.name), asc(instanceExternals.id)),
  ]);
  const roster = new Map<string, Placement[]>();
  const place = (teamId: string, placement: Placement) => roster.set(teamId, [...(roster.get(teamId) ?? []), placement]);
  for (const { teamId, ...person } of members) place(teamId, { kind: 'person', ...person });
  for (const { teamId, ...external } of outside) place(teamId, { kind: 'external', ...external });
  const shaped = teams.map((team) => {
    const placed = roster.get(team.id) ?? [];
    return {
      ...team,
      members: placed,
      count: placed.length,
      short: team.minMembers !== null && placed.length < team.minMembers,
      full: team.maxMembers !== null && placed.length >= team.maxMembers,
    };
  });
  const groupIds = new Set(groups.map((group) => group.id));
  const placementsOf = new Map<string, number>();
  for (const placement of outside) placementsOf.set(placement.id, (placementsOf.get(placement.id) ?? 0) + 1);
  const statusCount = (status: string) => shaped.filter((team) => team.status === status).length;
  return {
    id: instance.id,
    name: instance.name,
    description: instance.description,
    groupLabel: instance.groupLabel,
    createdAt: instance.createdAt,
    createdByName: creator[0]?.name ?? null,
    departments: linked,
    levels,
    groups: groups.map((group) => ({ ...group, teams: shaped.filter((team) => team.groupId === group.id) })),
    ungroupedTeams: shaped.filter((team) => team.groupId === null || !groupIds.has(team.groupId)),
    externals: externals.map((external) => ({ ...external, email: access.staff ? external.email : null, placements: placementsOf.get(external.id) ?? 0 })),
    stats: {
      teams: shaped.length,
      placements: members.length + outside.length,
      people: new Set(members.map((member) => member.id)).size + new Set(outside.map((external) => external.id)).size,
      short: shaped.filter((team) => team.short).length,
      active: statusCount('active'),
      eliminated: statusCount('eliminated'),
      winners: statusCount('winner'),
    },
    access,
  };
}

/** The latest 30 changes to an instance, newest first. Details hold names and values, never emails. */
export async function instanceActivity(instanceId: string) {
  const rows = await db
    .select({ id: auditLog.id, action: auditLog.action, createdAt: auditLog.createdAt, details: auditLog.details, actorName: people.fullName })
    .from(auditLog)
    .leftJoin(people, eq(people.id, auditLog.actorPersonId))
    .where(and(eq(auditLog.targetType, 'team_instance'), eq(auditLog.targetId, instanceId)))
    .orderBy(desc(auditLog.id))
    .limit(30);
  return rows.map(({ actorName, details, ...row }) => ({ ...row, actorName: actorName ?? 'System', details: details ?? {} }));
}

/** People the caller may place on this instance's teams: they have access, can see it, and are in the caller's scope. */
export async function placeablePeople(actor: Principal, { departmentIds }: LoadedInstance) {
  const everyone = await loadActivePrincipals();
  return everyone
    .filter(({ person, permissions }) => instanceAccess(permissions, departmentIds).view && canPlace(actor.permissions, person.departmentId))
    .map(({ person }) => ({ id: person.id, fullName: person.fullName, departmentId: person.departmentId }));
}
