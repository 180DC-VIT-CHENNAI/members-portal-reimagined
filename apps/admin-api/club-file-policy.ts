/** Shared legacy library only. Contextual/private documents use separate APIs. */
export const SHARED_FILE_CATEGORIES = ['general', 'projects', 'events'] as const;
export function isSharedFileCategory(value: string): boolean {
  return SHARED_FILE_CATEGORIES.some(category => category === value);
}
export function isSharedFileKey(key: string): boolean {
  const parts = key.split('/');
  return parts.length === 2 && isSharedFileCategory(parts[0]) && !!parts[1] && !parts[1].includes('..');
}
export async function* sharedFileObjects(bucket: any, category?: string): AsyncGenerator<any> {
  const categories = category ? [category] : SHARED_FILE_CATEGORIES;
  for (const item of categories) {
    if (!isSharedFileCategory(item)) continue;
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix: `${item}/`, ...(cursor ? { cursor } : {}) });
      for (const object of page.objects) if (isSharedFileKey(object.key)) yield object;
      if (page.truncated && (!page.cursor || page.cursor === cursor)) throw new Error('File listing pagination unavailable');
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
}
export async function sharedFileKeyById(bucket: any, id: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  let match: string | null = null;
  for await (const object of sharedFileObjects(bucket)) {
    const basename = object.key.split('/')[1];
    if (basename.split('.')[0] !== id) continue;
    if (match) return null; // Ambiguous IDs must not select another document.
    match = object.key;
  }
  return match;
}
export function downloadFileHeaders(name: string, contentType: string): Record<string, string> {
  const safeName = name.replace(/[\x00-\x1f\x7f"\\]/g, '_');
  return {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(safeName).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}
