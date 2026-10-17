import { api } from './api.ts';

export const loadProject = (id: string) => api('/api/projects/:id', { params: { id } });
export const loadProjectPeople = (id: string) => api('/api/projects/:id/people', { params: { id } });
export type Project = Awaited<ReturnType<typeof loadProject>>;
export type Task = Project['tasks'][number];
export type Candidate = Awaited<ReturnType<typeof loadProjectPeople>>[number];
