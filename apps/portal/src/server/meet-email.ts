import type { MeetKind } from '@schema';
import { escapeHtml } from './html.ts';

export const MEET_KIND_LABELS = {
  club: 'Club-wide',
  department: 'Department',
  inter_department: 'Inter-department',
} as const satisfies Record<MeetKind, string>;

export type MeetEmail = {
  readonly kind: MeetKind;
  readonly title: string;
  readonly description: string | null;
  readonly meetLink: string | null;
  readonly scheduledAt: string;
};

// The club meets in Chennai, so announcements give the time in IST.
const WHEN = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

/** The announcement sent to a meet's audience. */
export function meetEmailHtml(meet: MeetEmail): string {
  const parts = [
    `<h2>New meet: ${escapeHtml(meet.title)}</h2>`,
    `<p>${MEET_KIND_LABELS[meet.kind]} meet, ${escapeHtml(WHEN.format(new Date(meet.scheduledAt)))} IST</p>`,
  ];
  if (meet.description) parts.push(`<p>${escapeHtml(meet.description).replace(/\n/g, '<br>')}</p>`);
  parts.push(meet.meetLink ? `<p><a href="${escapeHtml(meet.meetLink)}">Join the meet</a></p>` : '<p>The venue will be shared later.</p>');
  return parts.join('\n');
}
