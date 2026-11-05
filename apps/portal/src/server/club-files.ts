// Shared club file library, ported from the old Worker's club-file-policy.ts.
// Files live only in the CLUB_FILES bucket as `<category>/<id>.<ext>`; their
// details (original name, uploader, event/project) are R2 custom metadata,
// exactly as the old Worker stored them, so existing objects list unchanged.
// Pure module (no void/* imports) so it runs under `node --test`.
import { sanitizeFileName } from './document-rules.ts';

/** Shared library only. Other prefixes in the bucket (letters/, ...) are private. */
export const SHARED_FILE_CATEGORIES = ['general', 'projects', 'events'] as const;
export type SharedFileCategory = (typeof SHARED_FILE_CATEGORIES)[number];

export function isSharedFileCategory(value: string): value is SharedFileCategory {
  return SHARED_FILE_CATEGORIES.some((category) => category === value);
}

/** `<category>/<name>` with nothing nested and no traversal. */
export function isSharedFileKey(key: string): boolean {
  const parts = key.split('/');
  return parts.length === 2 && isSharedFileCategory(parts[0]) && !!parts[1] && !parts[1].includes('..');
}

interface ListedObject {
  key: string;
}
interface ListPage<T extends ListedObject> {
  objects: T[];
  truncated?: boolean;
  cursor?: string;
}
/** The slice of R2Bucket.list this module needs (an R2Bucket satisfies it). */
export interface ListableBucket<T extends ListedObject = ListedObject> {
  list(options: { prefix: string; cursor?: string; include?: ('httpMetadata' | 'customMetadata')[] }): Promise<ListPage<T>>;
}

/** Every shared file (optionally one category), following list pagination. */
export async function* sharedFileObjects<T extends ListedObject>(bucket: ListableBucket<T>, category?: string): AsyncGenerator<T> {
  const categories = category ? [category] : SHARED_FILE_CATEGORIES;
  for (const item of categories) {
    if (!isSharedFileCategory(item)) continue;
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix: `${item}/`, include: ['httpMetadata', 'customMetadata'], ...(cursor ? { cursor } : {}) });
      for (const object of page.objects) if (isSharedFileKey(object.key)) yield object;
      if (page.truncated && (!page.cursor || page.cursor === cursor)) throw new Error('File listing pagination unavailable');
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
}

/** The key whose basename (before the extension) is exactly `id`; null when missing or ambiguous. */
export async function sharedFileKeyById(bucket: ListableBucket, id: string): Promise<string | null> {
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

/** Download headers: always an attachment, never cached, filename safely encoded. */
export function downloadFileHeaders(name: string, contentType: string): Record<string, string> {
  const safeName = sanitizeFileName(name);
  const encoded = encodeURIComponent(safeName).replace(/['()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
  return {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${encoded}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}

/**
 * Upload limits. The old Worker accepted any type and size here; the portal
 * accepts office documents, images, text and archives up to 25 MB, and stores
 * the content type implied by the extension rather than the one the browser sent.
 */
export const MAX_CLUB_FILE_BYTES = 25 * 1024 * 1024;
export const CLUB_FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  zip: 'application/zip',
};

/** Lower-case extension of a file name, or '' when it has none. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Error code for a file that may not be uploaded, or null when it is fine. */
export function clubFileProblem(file: { name: string; size: number }): 'empty_file' | 'file_too_large' | 'unsupported_file_type' | null {
  if (file.size <= 0) return 'empty_file';
  if (file.size > MAX_CLUB_FILE_BYTES) return 'file_too_large';
  if (!Object.hasOwn(CLUB_FILE_TYPES, fileExtension(file.name))) return 'unsupported_file_type';
  return null;
}

/** Optional text fields kept as custom metadata (R2 caps all metadata at 2 KB). */
export const CLUB_FILE_FIELDS = {
  eventName: 120,
  eventFor: 120,
  projectName: 120,
  meetingTitle: 120,
  meetingDate: 32,
  description: 500,
} as const;
export type ClubFileField = keyof typeof CLUB_FILE_FIELDS;

interface StoredObject {
  key: string;
  size: number;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

/** API shape of a stored club file. */
export function clubFileFromObject(object: StoredObject) {
  const m = object.customMetadata ?? {};
  const [category, basename = ''] = object.key.split('/');
  return {
    id: basename.split('.')[0],
    category,
    fileName: m.fileName || basename,
    fileType: object.httpMetadata?.contentType || m.fileType || '',
    fileSize: object.size,
    eventName: m.eventName || null,
    eventFor: m.eventFor || null,
    projectName: m.projectName || null,
    meetingTitle: m.meetingTitle || null,
    meetingDate: m.meetingDate || null,
    description: m.description || null,
    uploadedBy: m.uploadedBy || '',
    uploadedByName: m.uploadedByName || '',
    createdAt: m.createdAt || object.uploaded.toISOString(),
  };
}

export type ClubFile = ReturnType<typeof clubFileFromObject>;

export interface ClubFileFilter {
  eventName?: string;
  projectName?: string;
  search?: string;
}

/** Same matching as the old list endpoint: exact (case-insensitive) event/project, substring search on name and description. */
export function matchesClubFileFilter(file: ClubFile, filter: ClubFileFilter): boolean {
  const eventName = filter.eventName?.toLowerCase();
  const projectName = filter.projectName?.toLowerCase();
  const search = filter.search?.toLowerCase();
  if (eventName && (file.eventName ?? '').toLowerCase() !== eventName) return false;
  if (projectName && (file.projectName ?? '').toLowerCase() !== projectName) return false;
  if (search && !file.fileName.toLowerCase().includes(search) && !(file.description ?? '').toLowerCase().includes(search)) return false;
  return true;
}
