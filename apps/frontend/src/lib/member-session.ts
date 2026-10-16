import { apiUrl } from './api';

export async function createMemberSession(token: string, deviceLabel = 'Web browser') {
  const response = await fetch(apiUrl('/api/auth/session'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, deviceLabel }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'Unable to sign in');
  return data as MemberSession;
}

export type MemberSession = { token: string; sessionId: string; expiresAt: string; email: string; powerLevel: number; departmentId?: string; roleId: string };

export const GOOGLE_SIGN_IN_URL = apiUrl('/api/auth/google/start');

export async function exchangeGoogleCode(code: string): Promise<MemberSession> {
  const response = await fetch(apiUrl('/api/auth/google/exchange'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Google sign-in failed');
  return data as MemberSession;
}

export async function startGoogleLink(authToken: string): Promise<string> {
  const response = await fetch(apiUrl('/api/auth/google/link-start'), {
    method: 'POST', headers: { Authorization: `Bearer ${authToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) throw new Error(data.error || 'Could not start Google linking');
  return data.url as string;
}

export const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  not_linked: 'This Google account is not linked to a member. Sign in with your token, then link Google in Profile.',
  inactive: 'Your member access is inactive. Contact an administrator.',
  already_linked: 'That Google account is already linked to another member.',
  cancelled: 'Google sign-in was cancelled.',
  expired: 'The Google sign-in took too long. Try again.',
  invalid_state: 'Google sign-in could not be verified in this browser. Try again.',
  not_configured: 'Google sign-in is not configured on this deployment.',
  maintenance: 'The portal is under maintenance.',
  rate_limited: 'Too many sign-in attempts. Try again in a minute.',
};
