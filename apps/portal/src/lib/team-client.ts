import { api } from './api.ts';

export const loadInstances = () => api('/api/team-instances');
export const loadInstance = (id: string) => api('/api/team-instances/:id', { params: { id } });
export const loadPlaceable = (id: string) => api('/api/team-instances/:id/people', { params: { id } });
export const loadInstanceActivity = (id: string) => api('/api/team-instances/:id/activity', { params: { id } });

export type InstanceSummary = Awaited<ReturnType<typeof loadInstances>>[number];
export type Instance = Awaited<ReturnType<typeof loadInstance>>;
export type Group = Instance['groups'][number];
export type Team = Instance['ungroupedTeams'][number];
export type TeamStatus = Team['status'];
export type Placement = Team['members'][number];
export type External = Instance['externals'][number];
export type Placeable = Awaited<ReturnType<typeof loadPlaceable>>[number];
export type ActivityEntry = Awaited<ReturnType<typeof loadInstanceActivity>>[number];

export const TEAM_STATUS_LABEL = { active: 'Active', eliminated: 'Eliminated', winner: 'Winner' } as const satisfies Record<TeamStatus, string>;
export const TEAM_STATUS_TONE = { active: '', eliminated: '', winner: 'badge-success' } as const satisfies Record<TeamStatus, string>;

/** Teams in group order, then teams in no group. */
export function allTeams(instance: Instance): Team[] {
  return [...instance.groups.flatMap((group) => group.teams), ...instance.ungroupedTeams];
}

export function levelName(instance: Instance, position: number): string {
  return instance.levels.find((level) => level.position === position)?.name ?? `Level ${position}`;
}
