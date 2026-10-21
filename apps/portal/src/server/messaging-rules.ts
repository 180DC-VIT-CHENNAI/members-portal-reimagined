/** Authors may change their own message for this long after sending it. */
export const EDIT_WINDOW_MS = 15 * 60_000;
export const MESSAGE_MAX_LENGTH = 4000;
export const MAX_MENTIONS = 20;
export const MESSAGE_PAGE_SIZE = 50;
export const REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅'] as const;
export type Reaction = (typeof REACTIONS)[number];

/** SQLite `datetime('now')` text (UTC, no zone) or an ISO string, as epoch milliseconds. */
export function storedTime(value: string): number {
  return Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

export interface EditableMessage {
  readonly authorId: string;
  readonly createdAt: string;
  readonly deletedAt: string | null;
}

export type EditDecision = 'ok' | 'not_author' | 'deleted' | 'window_closed';

/** Only the author edits, only a live message, and only within 15 minutes of sending it. */
export function editDecision(message: EditableMessage, actorId: string, now: number): EditDecision {
  if (message.authorId !== actorId) return 'not_author';
  if (message.deletedAt) return 'deleted';
  return now - storedTime(message.createdAt) <= EDIT_WINDOW_MS ? 'ok' : 'window_closed';
}

/** `@[Display name](person id)`, the inline mention form the composer writes. */
const MENTION = /@\[([^\]\n]{1,120})\]\(([A-Za-z0-9_-]{1,64})\)/g;

/** Distinct person ids mentioned in a body, in order of first mention, at most 20. */
export function parseMentions(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION)) {
    ids.add(match[2]);
    if (ids.size === MAX_MENTIONS) break;
  }
  return [...ids];
}

export type BodySegment = { readonly text: string } | { readonly mention: string; readonly personId: string };

/** Split a body into plain text and mentions for rendering; nothing is interpreted as markup. */
export function bodySegments(body: string): BodySegment[] {
  const out: BodySegment[] = [];
  let at = 0;
  for (const match of body.matchAll(MENTION)) {
    if (match.index > at) out.push({ text: body.slice(at, match.index) });
    out.push({ mention: match[1], personId: match[2] });
    at = match.index + match[0].length;
  }
  if (at < body.length) out.push({ text: body.slice(at) });
  return out;
}

/** The plain-text form of a body: mentions become `@Name`. Used for previews. */
export function plainText(body: string): string {
  return body.replace(MENTION, (_, name: string) => `@${name}`);
}

/** The unique key of the direct conversation between two different people. */
export function directKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Quiet hours are both set (and different) or both empty. */
export function validQuietHours(start: string | null, end: string | null): boolean {
  if (start === null || end === null) return start === end;
  return HHMM.test(start) && HHMM.test(end) && start !== end;
}
