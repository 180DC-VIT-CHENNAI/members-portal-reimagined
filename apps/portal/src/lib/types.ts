import type { RouteMap } from 'void/routes';

type Output<P extends keyof RouteMap, M extends keyof RouteMap[P]> = RouteMap[P][M] extends { output: infer O } ? O : never;
type Input<P extends keyof RouteMap, M extends keyof RouteMap[P]> = RouteMap[P][M] extends { input: infer I } ? I : never;

export type MeResponse = Output<'/api/me', 'GET'>;
export type Me = MeResponse['person'];
export type PersonStatus = Me['status'];
export type DirectoryEntry = Output<'/api/people', 'GET'>[number];
export type DirectoryQuery = Input<'/api/people', 'GET'>['query'];
export type PersonDetail = Output<'/api/people/:id', 'GET'>;
export type Tenure = PersonDetail['tenures'][number];
export type ProfilePatch = Input<'/api/people/:id', 'PATCH'>['body'];
export type Grant = Input<'/api/people/:id/access', 'PUT'>['body']['grants'][number];
export type InviteBody = Input<'/api/people', 'POST'>['body'];
export type Department = Output<'/api/departments', 'GET'>[number];
export type Position = Output<'/api/positions', 'GET'>[number];
export type Term = Output<'/api/terms', 'GET'>[number];
export type RolesResponse = Output<'/api/access-roles', 'GET'>;
export type AccessRole = RolesResponse['roles'][number];
export type RolePermission = AccessRole['permissions'][number];
export type AuditEntry = Output<'/api/audit', 'GET'>[number];
export type ImportResponse = Output<'/api/imports/people', 'POST'>;
export type ImportRow = ImportResponse['results'][number];
export type TermStartResponse = Output<'/api/terms/:id/start', 'POST'>;
