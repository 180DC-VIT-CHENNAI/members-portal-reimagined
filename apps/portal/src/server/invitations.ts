import type { emailQueue } from '@schema';
import { sender } from './email/sender.ts';
import { escapeHtml } from './html.ts';

/** The production portal; invitation links always point here outside local development. */
export const PORTAL_ORIGIN = 'https://180dc.vitcc.org';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Where an invitation's sign-in link points. Production always uses the fixed
 * portal origin. Locally, the dev server's own loopback origin keeps links
 * usable in tests; the request's Origin header is never consulted.
 */
export function invitationOrigin(requestUrl: string, production: boolean): string {
  if (production) return PORTAL_ORIGIN;
  const url = new URL(requestUrl);
  return url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname) ? url.origin : PORTAL_ORIGIN;
}

export const INVITATION_SUBJECT = "You're invited to the 180DC members portal";

export function invitationHtml(input: { origin: string; inviterName: string; fullName: string | null }): string {
  const link = `${input.origin}/login`;
  return [
    '<h2>Welcome to the 180DC VIT Chennai members portal</h2>',
    input.fullName ? `<p>Hi ${escapeHtml(input.fullName)},</p>` : '',
    `<p>${escapeHtml(input.inviterName)} has added you to the members portal.</p>`,
    `<p><a href="${escapeHtml(link)}">Sign in to the portal</a> with Google, using the Google account for the email address this message was sent to.</p>`,
    '<p>There is no password or code to enter: the portal only accepts Google sign-in. If you were not expecting this, you can ignore this email.</p>',
  ].filter(Boolean).join('\n');
}

/** A pending invitation campaign row, shaped like `enqueueEmailCampaign` so it can join a write batch. */
export function invitationCampaign(input: {
  recipients: readonly string[];
  html: string;
  replyTo: string;
  createdBy: string;
  meta?: Record<string, unknown>;
}): typeof emailQueue.$inferInsert {
  const recipients = [...new Set(input.recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  return {
    id: crypto.randomUUID(),
    kind: 'invitation',
    fromAddress: sender('180DC VIT Chennai'),
    subject: INVITATION_SUBJECT,
    html: input.html,
    recipients,
    total: recipients.length,
    status: 'pending',
    createdBy: input.createdBy,
    meta: { ...input.meta, replyTo: input.replyTo },
  };
}

type Department = { id: string; active: boolean };
type Position = { id: string; departmentId: string | null; active: boolean };

/**
 * Check everything an invitation depends on before anything is written.
 * Returns an error code (the API's 400 message) or the position to record.
 */
export function checkInvitation(input: {
  departmentId: string | null;
  department: Department | undefined;
  roleExists: boolean;
  positionId: string | undefined;
  position: Position | undefined;
  currentTermId: string | undefined;
}): { ok: true; positionId: string | null } | { ok: false; error: string } {
  if (!input.roleExists) return { ok: false, error: 'unknown_access_role' };
  if (input.departmentId && (!input.department || !input.department.active)) return { ok: false, error: 'unknown_department' };
  if (!input.positionId) return { ok: true, positionId: null };
  const position = input.position;
  if (!position || !position.active || (position.departmentId !== null && position.departmentId !== input.departmentId)) {
    return { ok: false, error: 'unknown_position' };
  }
  if (!input.currentTermId) return { ok: false, error: 'no_current_term' };
  return { ok: true, positionId: position.id };
}

/** True when a D1 write failed on a unique index (for example a concurrent invite of the same email). */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current.message.includes('UNIQUE constraint failed')) return true;
  }
  return false;
}
