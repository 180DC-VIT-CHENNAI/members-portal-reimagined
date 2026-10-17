import {
  departments,
  instanceDepartments,
  instanceExternals,
  instanceGroups,
  instanceLevels,
  instanceTeamExternals,
  instanceTeamMembers,
  instanceTeams,
  TEAM_STATUSES,
  teamInstances,
} from '@schema';
import * as v from 'valibot';
import { and, asc, db, eq, inArray, sql } from 'void/db';
import { audit } from './audit';
import { badRequest, conflict, forbidden, notFound } from './http';
import { loadPersonPrincipal, type Person, type Principal } from './principal';
import { canPlace, type InstanceAccess, instanceAccess } from './team-instance-rules';
import { emailAddress, id, optionalText, singleLine } from './validation';

const teamSize = v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500))));
export const sortOrder = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000));

export const instanceFields = {
  name: singleLine(255),
  description: optionalText(5000),
  groupLabel: v.optional(singleLine(40)),
  departmentIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(20)),
  levels: v.optional(v.pipe(v.array(v.pipe(v.string(), v.trim(), v.maxLength(60))), v.minLength(1), v.maxLength(20))),
};

export const groupFields = { name: singleLine(255), organization: optionalText(200), description: optionalText(5000) };

export const externalFields = { name: singleLine(255), email: v.optional(v.nullable(emailAddress)), organization: optionalText(200) };

export const teamFields = { name: singleLine(255), description: optionalText(5000), groupId: v.optional(v.nullable(id)), minMembers: teamSize, maxMembers: teamSize };

export const teamPatch = v.object({
  name: v.optional(singleLine(255)),
  description: optionalText(5000),
  groupId: v.optional(v.nullable(id)),
  minMembers: teamSize,
  maxMembers: teamSize,
  sortOrder: v.optional(sortOrder),
  currentLevel: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20))),
  status: v.optional(v.picklist(TEAM_STATUSES)),
});

export const PLACEMENT_KINDS = ['person', 'external'] as const;
export type PlacementKind = (typeof PLACEMENT_KINDS)[number];

export type TeamInstance = typeof teamInstances.$inferSelect;
export type InstanceTeam = typeof instanceTeams.$inferSelect;

export interface LoadedInstance {
  readonly instance: TeamInstance;
  readonly departmentIds: string[];
  readonly levels: { position: number; name: string }[];
  readonly access: InstanceAccess;
}

/** The instance and the caller's rights on it; 404 when it is missing or hidden from them. */
export async function instanceFor(principal: Principal, instanceId: string): Promise<LoadedInstance> {
  const [instance] = await db.select().from(teamInstances).where(eq(teamInstances.id, instanceId));
  if (!instance) notFound('instance_not_found');
  const [links, levels] = await Promise.all([
    db.select({ id: instanceDepartments.departmentId }).from(instanceDepartments).where(eq(instanceDepartments.instanceId, instanceId)),
    db
      .select({ position: instanceLevels.position, name: instanceLevels.name })
      .from(instanceLevels)
      .where(eq(instanceLevels.instanceId, instanceId))
      .orderBy(asc(instanceLevels.position)),
  ]);
  const departmentIds = links.map((link) => link.id);
  const access = instanceAccess(principal.permissions, departmentIds);
  if (!access.view) notFound('instance_not_found');
  return { instance, departmentIds, levels, access };
}

/** 403 unless the caller may run (`staff`) or reshape (`configure`) the instance. */
export function requireInstanceRight(loaded: LoadedInstance, right: 'staff' | 'configure'): void {
  if (!loaded.access[right]) forbidden();
}

/** Record an instance event; every event targets the instance so its activity is one indexed read. */
export function instanceAudit(actor: Principal, action: string, instanceId: string, details: Record<string, unknown>): Promise<void> {
  return audit(actor.person.id, `team_instance.${action}`, 'team_instance', instanceId, details);
}

/** 400 unless every department exists. */
export async function requireDepartments(ids: readonly string[]): Promise<void> {
  const found = await db.select({ id: departments.id }).from(departments).where(inArray(departments.id, [...ids]));
  if (found.length !== ids.length) badRequest('unknown_department');
}

/** 400 unless the group belongs to this instance. */
export async function requireGroup(instanceId: string, groupId: string | null | undefined): Promise<void> {
  if (!groupId) return;
  const [group] = await db
    .select({ id: instanceGroups.id })
    .from(instanceGroups)
    .where(and(eq(instanceGroups.id, groupId), eq(instanceGroups.instanceId, instanceId)));
  if (!group) badRequest('unknown_group');
}

/** 400 when the minimum exceeds the cap. */
export function requireSizes(minMembers: number | null, maxMembers: number | null): void {
  if (minMembers !== null && maxMembers !== null && minMembers > maxMembers) badRequest('min_above_max');
}

export async function teamOr404(instanceId: string, teamId: string): Promise<InstanceTeam> {
  const [team] = await db
    .select()
    .from(instanceTeams)
    .where(and(eq(instanceTeams.id, teamId), eq(instanceTeams.instanceId, instanceId)));
  if (!team) notFound('team_not_found');
  return team;
}

export async function groupOr404(instanceId: string, groupId: string) {
  const [group] = await db
    .select()
    .from(instanceGroups)
    .where(and(eq(instanceGroups.id, groupId), eq(instanceGroups.instanceId, instanceId)));
  if (!group) notFound('group_not_found');
  return group;
}

export async function externalOr404(instanceId: string, externalId: string) {
  const [external] = await db
    .select()
    .from(instanceExternals)
    .where(and(eq(instanceExternals.id, externalId), eq(instanceExternals.instanceId, instanceId)));
  if (!external) notFound('external_not_found');
  return external;
}

/**
 * The person, if the actor may place them on this instance's teams: they must
 * have access and be able to see the instance, and a department-scoped
 * manager may only place people from their own departments.
 */
export async function placeablePerson(actor: Principal, loaded: LoadedInstance, personId: string): Promise<Person> {
  const target = await loadPersonPrincipal(personId);
  if (!target || !instanceAccess(target.permissions, loaded.departmentIds).view) badRequest('person_not_eligible');
  if (!canPlace(actor.permissions, target.person.departmentId)) forbidden('outside_your_departments');
  return target.person;
}

/** The name of whoever is being moved, after checking they may be placed. */
export async function placeableName(actor: Principal, loaded: LoadedInstance, kind: PlacementKind, memberId: string): Promise<string> {
  switch (kind) {
    case 'person':
      return (await placeablePerson(actor, loaded, memberId)).fullName;
    case 'external':
      return (await externalOr404(loaded.instance.id, memberId)).name;
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled placement kind: ${String(unhandled)}`);
    }
  }
}

/** Whether a person or outside person is on a team. */
export async function isPlaced(kind: PlacementKind, teamId: string, memberId: string): Promise<boolean> {
  switch (kind) {
    case 'person': {
      const rows = await db
        .select({ teamId: instanceTeamMembers.teamId })
        .from(instanceTeamMembers)
        .where(and(eq(instanceTeamMembers.teamId, teamId), eq(instanceTeamMembers.personId, memberId)))
        .limit(1);
      return rows.length > 0;
    }
    case 'external': {
      const rows = await db
        .select({ teamId: instanceTeamExternals.teamId })
        .from(instanceTeamExternals)
        .where(and(eq(instanceTeamExternals.teamId, teamId), eq(instanceTeamExternals.externalId, memberId)))
        .limit(1);
      return rows.length > 0;
    }
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled placement kind: ${String(unhandled)}`);
    }
  }
}

/** How many members and outside people are on a team. */
/** SQL: how many people are on the `instance_teams` row in scope, members and outside people together. */
export const placedOnTeam = () =>
  sql<number>`((SELECT count(*) FROM instance_team_members m WHERE m.team_id = ${instanceTeams.id}) + (SELECT count(*) FROM instance_team_externals x WHERE x.team_id = ${instanceTeams.id}))`;

/** SQL: the `instance_teams` row in scope has no cap, or fewer people than its cap. */
const hasRoom = () => sql`(${instanceTeams.maxMembers} IS NULL OR ${instanceTeams.maxMembers} > ${placedOnTeam()})`;

/**
 * Place a member on a team. The cap is checked inside the insert itself, so
 * concurrent placements cannot both take the last place. Returns the added row,
 * or nothing when they were already on it or it is full (see `refusePlacement`).
 */
export function placeMember(teamId: string, personId: string, addedBy: string) {
  return db
    .insert(instanceTeamMembers)
    .select(
      db
        .select({
          teamId: sql<string>`${teamId}`.as('team_id'),
          personId: sql<string>`${personId}`.as('person_id'),
          addedBy: sql<string>`${addedBy}`.as('added_by'),
          createdAt: sql<string>`datetime('now')`.as('created_at'),
        })
        .from(instanceTeams)
        .where(and(eq(instanceTeams.id, teamId), hasRoom())),
    )
    .onConflictDoNothing()
    .returning({ teamId: instanceTeamMembers.teamId });
}

/** `placeMember` for an outside person from the instance's register. */
export function placeExternal(teamId: string, externalId: string, addedBy: string) {
  return db
    .insert(instanceTeamExternals)
    .select(
      db
        .select({
          teamId: sql<string>`${teamId}`.as('team_id'),
          externalId: sql<string>`${externalId}`.as('external_id'),
          addedBy: sql<string>`${addedBy}`.as('added_by'),
          createdAt: sql<string>`datetime('now')`.as('created_at'),
        })
        .from(instanceTeams)
        .where(and(eq(instanceTeams.id, teamId), hasRoom())),
    )
    .onConflictDoNothing()
    .returning({ teamId: instanceTeamExternals.teamId });
}

/** Explain a placement that added nothing: 409 already_on_team, 404 when the team is gone, otherwise 409 team_full. */
export async function refusePlacement(kind: PlacementKind, instanceId: string, teamId: string, memberId: string): Promise<never> {
  if (await isPlaced(kind, teamId, memberId)) conflict('already_on_team');
  await teamOr404(instanceId, teamId);
  conflict('team_full');
}
