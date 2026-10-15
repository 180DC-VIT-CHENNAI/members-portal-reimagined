import { decodeStoredSession } from './stored-session.ts';
export type Session = { token: string; expiresAt: string; email: string; name: string; powerLevel: number };
export type DeviceSession = { id: string; device_label: string; created_at: string; expires_at: string; current: boolean };
export type WorkQueue = {
  generatedAt: string;
  hasMoreTasks: boolean; hasMoreMeetings: boolean;
  tasks: { id: string; project_id: string; title: string; project_name: string; project_deadline: string | null; due_date?: string | null; priority?: string }[];
  meetings: { id: string; type: string; title: string; scheduled_at: string; meet_link: string | null }[];
  attention: { incomingTransfers: number; accountRequests?: number };
};
export function decodeWorkQueue(value: unknown): WorkQueue {
  const q = value as WorkQueue | null;
  const text = (value: unknown) => typeof value === 'string';
  const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
  if (!q || !text(q.generatedAt) || !Number.isFinite(Date.parse(q.generatedAt))
    || typeof q.hasMoreTasks !== 'boolean' || typeof q.hasMoreMeetings !== 'boolean'
    || !Array.isArray(q.tasks) || q.tasks.length > 100
    || !q.tasks.every(t => t && text(t.id) && text(t.project_id) && text(t.title) && text(t.project_name) && (t.project_deadline === null || text(t.project_deadline)) && (t.due_date === undefined || t.due_date === null || text(t.due_date)) && (t.priority === undefined || ['low', 'normal', 'high', 'urgent'].includes(t.priority)))
    || !Array.isArray(q.meetings) || q.meetings.length > 20
    || !q.meetings.every(m => m && text(m.id) && text(m.type) && text(m.title) && text(m.scheduled_at) && (m.meet_link === null || text(m.meet_link)))
    || !q.attention || !count(q.attention.incomingTransfers)
    || (q.attention.accountRequests !== undefined && !count(q.attention.accountRequests))) {
    throw new ApiError('Invalid work queue response', 200);
  }
  return q;
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export function apiOrigin(value: string | undefined): string {
  if (!value) throw new Error('API address is not configured');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) throw new Error('API address must be an exact HTTPS origin');
  return url.origin;
}
export function memberClient(origin: string, transport: typeof fetch = fetch) {
  const base = apiOrigin(origin);
  async function request(path: string, token?: string, method = 'GET', body?: unknown) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
    const response = await transport(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(typeof data?.error === 'string' ? data.error : 'Request failed', response.status);
    if (!data || typeof data !== 'object') throw new ApiError('Invalid service response', response.status);
    return data;
    } finally { clearTimeout(timeout); }
  }
  return {
    signIn: async (token: string): Promise<Session> => {
      const data = await request('/api/auth/session', undefined, 'POST', { token, deviceLabel: 'Android' });
      const session = decodeStoredSession(JSON.stringify(data));
      if (!session) throw new ApiError('Invalid session response', 200);
      return session;
    },
    sessions: async (token: string): Promise<DeviceSession[]> => {
      const data = await request('/api/auth/sessions', token);
      if (data.success !== true || !Array.isArray(data.data) || data.data.length > 20 || !data.data.every((s: DeviceSession) => s && typeof s.id === 'string' && typeof s.device_label === 'string' && typeof s.current === 'boolean' && typeof s.created_at === 'string' && Number.isFinite(Date.parse(s.created_at)) && typeof s.expires_at === 'string' && Number.isFinite(Date.parse(s.expires_at)))) throw new ApiError('Invalid sessions response', 200);
      return data.data;
    },
    revoke: (token: string, id: string) => request(`/api/auth/sessions/${encodeURIComponent(id)}`, token, 'DELETE'),
    queue: async (token: string): Promise<WorkQueue> => decodeWorkQueue(await request('/api/work-queue', token)),
    complete: (token: string, project: string, task: string) => request(`/api/projects/${encodeURIComponent(project)}/tasks/${encodeURIComponent(task)}`, token, 'PUT', { status: 'completed' }),
    logout: (token: string) => request('/api/auth/logout', token, 'POST'),
  };
}
