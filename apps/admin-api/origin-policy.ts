/** Explicit additional browser origins for an isolated deployment. Never permits wildcards. */
export function configuredOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((entry) => {
    const text = entry.trim();
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.origin !== text || url.username || url.password || url.hostname.includes('*')) {
      throw new Error('ALLOWED_WEB_ORIGINS must contain exact HTTPS origins');
    }
    return url.origin;
  });
}

export function isAllowedWebOrigin(origin: string, configured: string | undefined, defaults: readonly string[]): boolean {
  // Validate the complete deployment configuration before accepting any origin.
  try {
    return [...defaults, ...configuredOrigins(configured)].includes(origin);
  } catch {
    return false;
  }
}
