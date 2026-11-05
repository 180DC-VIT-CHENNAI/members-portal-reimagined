export const MAX_SHARE_DAYS = 30;
export const DAY_MS = 86_400_000;

export function sanitizeFileName(name: string): string {
  return name.replace(/[\x00-\x1f\x7f"\\/:]/g, '_').replace(/^\.+/, '_').slice(0, 255) || 'download';
}

/** SHA-256 for bytes and high-entropy bearer tokens; tokens never enter the database. */
export async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validShareExpiry(expiresAt: string, now: number): boolean {
  const expires = Date.parse(expiresAt);
  return Number.isFinite(expires) && expires > now && expires <= now + MAX_SHARE_DAYS * DAY_MS;
}
