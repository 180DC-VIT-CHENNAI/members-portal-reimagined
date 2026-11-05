import { mailConversations, mailDrafts, mailNotifications, mailboxes } from '@schema';
import * as v from 'valibot';
import { and, db, desc, eq, inArray, isNull, lt, lte, sql } from 'void/db';
import type { Principal } from '../principal';
import { statement } from './access';

/** Same current grants for fan-out and retrieval; management is never reading permission. */
const grant = (person: string, mailbox: string, capability: string) => `EXISTS(
  SELECT 1 FROM mailbox_memberships access_grant JOIN people notice_person ON notice_person.id=access_grant.person_id
  WHERE access_grant.person_id=${person} AND access_grant.mailbox_id=${mailbox} AND access_grant.capability='${capability}'
    AND notice_person.status IN ('active','on_leave') AND julianday(access_grant.valid_from)<=julianday('now')
    AND (access_grant.valid_until IS NULL OR julianday(access_grant.valid_until)>julianday('now')))`;

/** In the same inbound/release transaction: only accepted messages and current readers. */
export function notifyInbound(messageId: string) {
  return statement(`INSERT OR IGNORE INTO mail_notifications
    (recipient_id,mailbox_id,conversation_id,kind,dedupe_key)
    SELECT DISTINCT g.person_id,m.mailbox_id,m.conversation_id,'mail_reply','reply:' || m.id
    FROM mail_messages m JOIN mailbox_memberships g ON g.mailbox_id=m.mailbox_id
    WHERE m.id=? AND m.status='received' AND m.conversation_id IS NOT NULL
      AND ${grant('g.person_id', 'm.mailbox_id', 'mailbox.read')}`, [messageId]);
}

/** Place immediately after the guarded triage update; failed mutations create no notice. */
export function notifyAssignment(input: { mailboxId: string; conversationId: string; assignee: string; previous: string | null }) {
  return statement(`INSERT OR IGNORE INTO mail_notifications
    (recipient_id,mailbox_id,conversation_id,kind,dedupe_key)
    SELECT assigned_to,mailbox_id,id,'mail_assigned',? FROM mail_conversations
    WHERE changes()=1 AND id=? AND mailbox_id=? AND assigned_to=? AND assigned_to IS NOT ?`,
  [`assigned:${crypto.randomUUID()}`, input.conversationId, input.mailboxId, input.assignee, input.previous]);
}

/** In the review transaction; the unique review id guards both race losers and replays. */
export function notifyReview(draftId: string, reviewId: string, actorId: string) {
  return statement(`INSERT OR IGNORE INTO mail_notifications
    (recipient_id,mailbox_id,draft_id,kind,dedupe_key)
    SELECT DISTINCT g.person_id,d.mailbox_id,d.id,'mail_review','review:' || ?
    FROM mail_drafts d JOIN mailbox_memberships g ON g.mailbox_id=d.mailbox_id
    WHERE d.id=? AND d.last_review_id=? AND d.state='submitted' AND g.person_id<>?
      AND g.capability='mailbox.review'
      AND julianday(g.valid_from)<=julianday('now')
      AND (g.valid_until IS NULL OR julianday(g.valid_until)>julianday('now'))
      AND EXISTS(SELECT 1 FROM mailbox_memberships r JOIN people p ON p.id=r.person_id
        WHERE r.person_id=g.person_id AND r.mailbox_id=d.mailbox_id AND r.capability='mailbox.read'
          AND p.status IN ('active','on_leave') AND julianday(r.valid_from)<=julianday('now')
          AND (r.valid_until IS NULL OR julianday(r.valid_until)>julianday('now')))`,
  [reviewId, draftId, reviewId, actorId]);
}

const visible = (actor: Principal) => and(
  eq(mailNotifications.recipientId, actor.person.id),
  sql.raw(grant('mail_notifications.recipient_id', 'mail_notifications.mailbox_id', 'mailbox.read')),
  sql`(${mailNotifications.kind}<>'mail_review' OR (
    ${mailDrafts.state}='submitted' AND
    ${sql.raw(grant('mail_notifications.recipient_id', 'mail_notifications.mailbox_id', 'mailbox.review'))}
  ))`,
  sql`(${mailNotifications.kind}='mail_review' OR ${mailConversations.id} IS NOT NULL)`,
);

export const mailNoticesQuery = v.object({
  before: v.optional(v.pipe(v.string(), v.regex(/^[1-9]\d{0,14}$/, 'invalid_cursor'), v.transform(Number))),
  unread: v.optional(v.picklist(['1'])),
});
const noticeId = v.pipe(v.number(), v.integer(), v.minValue(1));
export const markMailNoticesInput = v.union([
  v.object({ ids: v.pipe(v.array(noticeId), v.minLength(1), v.maxLength(50)) }),
  v.object({ upTo: noticeId }),
]);

/** Mail notices are another section of /notifications, following the existing mention section. */
export async function mailNoticeInbox(actor: Principal, query: v.InferOutput<typeof mailNoticesQuery>) {
  const rows = await db.select({
    id: mailNotifications.id, kind: mailNotifications.kind, mailboxId: mailNotifications.mailboxId,
    mailboxName: mailboxes.displayName, conversationId: mailNotifications.conversationId, draftId: mailNotifications.draftId,
    createdAt: mailNotifications.createdAt, readAt: mailNotifications.readAt,
  }).from(mailNotifications)
    .innerJoin(mailboxes, eq(mailboxes.id, mailNotifications.mailboxId))
    .leftJoin(mailConversations, and(eq(mailConversations.id, mailNotifications.conversationId), eq(mailConversations.mailboxId, mailNotifications.mailboxId)))
    .leftJoin(mailDrafts, and(eq(mailDrafts.id, mailNotifications.draftId), eq(mailDrafts.mailboxId, mailNotifications.mailboxId)))
    .where(and(visible(actor), query.unread ? isNull(mailNotifications.readAt) : undefined,
      query.before ? lt(mailNotifications.id, query.before) : undefined))
    .orderBy(desc(mailNotifications.id)).limit(31);
  return { notices: rows.slice(0, 30), nextBefore: rows.length > 30 ? rows[29].id : null };
}

export async function unreadMailNoticeRows(actor: Principal, limit: number) {
  const rows = await db.select({ id: mailNotifications.id }).from(mailNotifications)
    .leftJoin(mailConversations, and(eq(mailConversations.id, mailNotifications.conversationId), eq(mailConversations.mailboxId, mailNotifications.mailboxId)))
    .leftJoin(mailDrafts, and(eq(mailDrafts.id, mailNotifications.draftId), eq(mailDrafts.mailboxId, mailNotifications.mailboxId)))
    .where(and(visible(actor), isNull(mailNotifications.readAt))).limit(limit);
  return rows.length;
}

/** Recipient-only read state; never authorizes opening the underlying mailbox. */
export async function markMailNoticesRead(actor: Principal, input: v.InferOutput<typeof markMailNoticesInput>) {
  await db.update(mailNotifications).set({ readAt: new Date().toISOString() }).where(and(
    eq(mailNotifications.recipientId, actor.person.id), isNull(mailNotifications.readAt),
    'ids' in input ? inArray(mailNotifications.id, input.ids) : lte(mailNotifications.id, input.upTo),
  ));
}
