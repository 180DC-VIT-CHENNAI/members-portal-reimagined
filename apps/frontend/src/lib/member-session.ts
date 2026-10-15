import { apiUrl } from './api';

export async function createMemberSession(token: string, deviceLabel = 'Web browser') {
  const response = await fetch(apiUrl('/api/auth/session'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, deviceLabel }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'Unable to sign in');
  return data as { token: string; sessionId: string; expiresAt: string; email: string; powerLevel: number; departmentId?: string; roleId: string };
}
