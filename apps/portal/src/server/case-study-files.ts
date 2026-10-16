// Case-study uploads in the CASE_STUDIES bucket: images/ and source/ only.
// Pure module (no void/* imports) so it runs under `node --test`.

/** Browser-declared image type -> stored extension (the old Worker's allow-list). */
export const CASE_STUDY_IMAGE_TYPES: Record<string, string | undefined> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
export const MAX_CASE_STUDY_IMAGE_BYTES = 10 * 1024 * 1024;

/** `images/<name>` or `source/<name>`, one level, no traversal. */
export function isCaseStudyFileKey(key: string): boolean {
  const parts = key.split('/');
  return parts.length === 2 && (parts[0] === 'images' || parts[0] === 'source') && /^[A-Za-z0-9_-]+\.[a-z0-9]{1,8}$/.test(parts[1]);
}
