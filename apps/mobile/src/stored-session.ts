import type { Session } from './api';
/** Device storage is untrusted input; never restore malformed or expired access. */
export function decodeStoredSession(raw: string | null, now = Date.now()): Session | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' ||
        typeof value.token !== 'string' || !/^180dc_session_[a-f0-9]{64}$/.test(value.token) ||
        typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= now ||
        typeof value.email !== 'string' || typeof value.name !== 'string' ||
        !Number.isSafeInteger(value.powerLevel) || value.powerLevel < 0) return null;
    return { token: value.token, expiresAt: value.expiresAt, email: value.email, name: value.name, powerLevel: value.powerLevel };
  } catch { return null; }
}
