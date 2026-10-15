export const SESSION_PREFIX = '180dc_session_';
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function credentialHash(token: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function newSessionCredential(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return SESSION_PREFIX + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function activeRegistryToken(row: any, now = Date.now()): boolean {
  if (!row || row.revoked_at) return false;
  if (row.expires_at == null) return true;
  const value = String(row.expires_at);
  const date = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value + 'Z';
  const expiry = Date.parse(date);
  return Number.isFinite(expiry) && expiry > now;
}
