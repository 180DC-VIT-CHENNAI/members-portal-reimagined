import { mailAttachments, mailConversationNotes, mailConversations, mailboxMemberships, mailConversationReads, mailMessages, people } from '@schema';
import type { Context } from 'hono';
import { and, db, desc, eq, inArray, lt, or, sql } from 'void/db';
import { bucket } from '../buckets';
import { downloadFileHeaders } from '../club-files';
import { badRequest, forbidden, notFound } from '../http';
import type { Principal } from '../principal';
import { mailboxFor, requireCapability, statement } from './access';
import type { InboxView } from './inbox-types';
import { emailDocument, sanitizeEmailHtml } from './sanitize-email';

export async function conversationFor(actor: Principal, mailboxId: string, conversationId: string) {
  const access = await mailboxFor(actor, mailboxId);
  requireCapability(access, 'mailbox.read');
  const [conversation] = await db.select().from(mailConversations)
    .where(and(eq(mailConversations.mailboxId, mailboxId), eq(mailConversations.id, conversationId)));
  if (!conversation) notFound();
  return { ...access, conversation };
}

export async function inboxCounts(actor: Principal, mailboxId: string) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.read');
  const [counts] = await db.select({
    inbox: sql<number>`coalesce(sum(case when ${mailConversations.status}<>'closed' then 1 else 0 end),0)`,
    assigned: sql<number>`coalesce(sum(case when ${mailConversations.status}<>'closed' and ${mailConversations.assignedTo}=${actor.person.id} then 1 else 0 end),0)`,
    unassigned: sql<number>`coalesce(sum(case when ${mailConversations.status}<>'closed' and ${mailConversations.assignedTo} is null then 1 else 0 end),0)`,
    unread: sql<number>`coalesce(sum(case when ${mailConversations.status}<>'closed' and
      (${mailConversationReads.readAt} is null or ${mailConversationReads.readAt}<${mailConversations.lastInboundAt}) then 1 else 0 end),0)`,
    overdue: sql<number>`coalesce(sum(case when ${mailConversations.status}<>'closed' and ${mailConversations.assignedTo}=${actor.person.id}
      and julianday(${mailConversations.dueForReplyAt})<=julianday('now') then 1 else 0 end),0)`,
  }).from(mailConversations).leftJoin(mailConversationReads, and(
    eq(mailConversationReads.conversationId, mailConversations.id), eq(mailConversationReads.personId, actor.person.id),
  )).where(eq(mailConversations.mailboxId, mailboxId));
  return counts;
}

/** Unread open conversations across every mailbox the caller can read now, capped at 99 like notices. */
export async function unreadMailTotal(actor: Principal) {
  const row = await statement(`SELECT count(*) AS unread FROM (SELECT 1 FROM mail_conversations c
    LEFT JOIN mail_conversation_reads r ON r.conversation_id=c.id AND r.person_id=?
    WHERE c.status<>'closed' AND (r.read_at IS NULL OR r.read_at<c.last_inbound_at)
      AND EXISTS(SELECT 1 FROM mailbox_memberships g WHERE g.mailbox_id=c.mailbox_id AND g.person_id=?
        AND g.capability='mailbox.read' AND julianday(g.valid_from)<=julianday('now')
        AND (g.valid_until IS NULL OR julianday(g.valid_until)>julianday('now')))
    LIMIT 100)`, [actor.person.id, actor.person.id]).first<{ unread: number }>();
  const unread = row?.unread ?? 0;
  return { unread: Math.min(unread, 99), capped: unread > 99 };
}

export async function listConversations(actor: Principal, mailboxId: string, query: {
  readonly view?: InboxView; readonly q?: string; readonly before?: string;
}) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.read');
  const view = query.view ?? 'inbox';
  const [cursor] = query.before ? await db.select().from(mailConversations).where(and(
    eq(mailConversations.mailboxId, mailboxId), eq(mailConversations.id, query.before),
  )) : [];
  if (query.before && !cursor) badRequest('invalid_cursor');
  const search = query.q?.trim().replace(/[\\%_]/g, '\\$&');
  const rows = await db.select({
    conversation: mailConversations, assigneeName: people.fullName,
    unread: sql<number>`case when ${mailConversationReads.readAt} is null or
      ${mailConversationReads.readAt}<${mailConversations.lastInboundAt} then 1 else 0 end`,
  }).from(mailConversations)
    .leftJoin(people, eq(people.id, mailConversations.assignedTo))
    .leftJoin(mailConversationReads, and(eq(mailConversationReads.conversationId, mailConversations.id), eq(mailConversationReads.personId, actor.person.id)))
    .where(and(eq(mailConversations.mailboxId, mailboxId),
      view === 'archive' ? eq(mailConversations.status, 'closed') : view === 'search' ? undefined : sql`${mailConversations.status}<>'closed'`,
      view === 'assigned' ? eq(mailConversations.assignedTo, actor.person.id) : undefined,
      view === 'unassigned' ? sql`${mailConversations.assignedTo} IS NULL` : undefined,
      cursor ? or(lt(mailConversations.lastMessageAt, cursor.lastMessageAt),
        and(eq(mailConversations.lastMessageAt, cursor.lastMessageAt), lt(mailConversations.id, cursor.id))) : undefined,
      search ? sql`EXISTS(SELECT 1 FROM mail_messages m WHERE m.mailbox_id=${mailboxId}
        AND m.conversation_id=${mailConversations.id} AND m.status<>'quarantined'
        AND (m.subject LIKE ${`%${search}%`} ESCAPE '\\' OR m.text LIKE ${`%${search}%`} ESCAPE '\\'
          OR m.from_json LIKE ${`%${search}%`} ESCAPE '\\'))` : undefined))
    .orderBy(desc(mailConversations.lastMessageAt), desc(mailConversations.id)).limit(51);
  const conversations = rows.slice(0, 50).map((r) => ({
    ...r.conversation, tags: [...r.conversation.tags], assigneeName: r.assigneeName, unread: Boolean(r.unread),
  }));
  return { conversations, nextBefore: rows.length > 50 ? conversations.at(-1)?.id ?? null : null };
}

export async function conversationDetail(actor: Principal, mailboxId: string, conversationId: string, before?: string) {
  const access = await conversationFor(actor, mailboxId, conversationId);
  const [cursor] = before ? await db.select().from(mailMessages).where(and(
    eq(mailMessages.mailboxId, mailboxId), eq(mailMessages.conversationId, conversationId), eq(mailMessages.id, before),
  )) : [];
  if (before && !cursor) badRequest('invalid_cursor');
  const rows = await db.select().from(mailMessages).where(and(
    eq(mailMessages.mailboxId, mailboxId), eq(mailMessages.conversationId, conversationId),
    sql`${mailMessages.status}<>'quarantined'`,
    cursor ? or(lt(mailMessages.receivedAt, cursor.receivedAt), and(eq(mailMessages.receivedAt, cursor.receivedAt), lt(mailMessages.id, cursor.id))) : undefined,
  )).orderBy(desc(mailMessages.receivedAt), desc(mailMessages.id)).limit(51);
  const messages = rows.slice(0, 50);
  const ids = messages.map((m) => m.id);
  const attachments = ids.length ? await db.select().from(mailAttachments)
    .where(and(eq(mailAttachments.mailboxId, mailboxId), inArray(mailAttachments.messageId, ids))) : [];
  const notes = await db.select({ id: mailConversationNotes.id, body: mailConversationNotes.body, author: people.fullName, createdAt: mailConversationNotes.createdAt })
    .from(mailConversationNotes).innerJoin(people, eq(people.id, mailConversationNotes.authorId))
    .where(and(eq(mailConversationNotes.mailboxId, mailboxId), eq(mailConversationNotes.conversationId, conversationId)))
    .orderBy(desc(mailConversationNotes.createdAt)).limit(50);
  return {
    conversation: { ...access.conversation, tags: [...access.conversation.tags] }, capabilities: [...access.capabilities],
    messages: messages.reverse().map((m) => ({
      id: m.id, direction: m.direction, status: m.status, from: m.from, to: [...m.to], cc: [...m.cc],
      subject: m.subject, text: m.text, receivedAt: m.receivedAt, authSignals: m.authSignals, hasHtml: !!m.htmlKey,
      attachments: attachments.filter((a) => a.messageId === m.id).map((a) => ({
        id: a.id, filename: a.filename, mime: a.mime, size: a.size, inline: a.inline, quarantineStatus: a.quarantineStatus,
      })),
    })), notes, nextBefore: rows.length > 50 ? rows[49].id : null,
  };
}

export async function messageFor(actor: Principal, mailboxId: string, conversationId: string, messageId: string) {
  await conversationFor(actor, mailboxId, conversationId);
  const [message] = await db.select().from(mailMessages).where(and(eq(mailMessages.id, messageId),
    eq(mailMessages.mailboxId, mailboxId), eq(mailMessages.conversationId, conversationId), sql`${mailMessages.status}<>'quarantined'`));
  if (!message) notFound();
  return message;
}

export async function messageBody(c: Context, actor: Principal, input: {
  readonly mailboxId: string; readonly conversationId: string; readonly messageId: string; readonly remote: boolean;
}) {
  const message = await messageFor(actor, input.mailboxId, input.conversationId, input.messageId);
  const object = message.htmlKey ? await bucket(c, 'CLUB_FILES').get(message.htmlKey) : null;
  const safe = sanitizeEmailHtml(object ? await object.text() : '', input.remote);
  return { text: message.text, document: safe.html ? emailDocument(safe.html, input.remote) : null, remoteBlocked: safe.remoteBlocked };
}

export async function downloadInbound(c: Context, actor: Principal, input: {
  readonly mailboxId: string; readonly conversationId: string; readonly attachmentId: string;
}) {
  await conversationFor(actor, input.mailboxId, input.conversationId);
  const [attachment] = await db.select({ attachment: mailAttachments }).from(mailAttachments)
    .innerJoin(mailMessages, and(eq(mailMessages.id, mailAttachments.messageId), eq(mailMessages.mailboxId, input.mailboxId)))
    .where(and(eq(mailAttachments.id, input.attachmentId), eq(mailAttachments.mailboxId, input.mailboxId),
      eq(mailMessages.conversationId, input.conversationId), sql`${mailMessages.status}<>'quarantined'`));
  if (!attachment) notFound();
  if (attachment.attachment.quarantineStatus !== 'allowed') forbidden('attachment_quarantined');
  const object = await bucket(c, 'CLUB_FILES').get(attachment.attachment.key);
  if (!object) notFound();
  return new Response(object.body, { headers: downloadFileHeaders(attachment.attachment.filename, 'application/octet-stream') });
}

export async function assignees(actor: Principal, mailboxId: string) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.assign');
  return db.selectDistinct({ id: people.id, name: people.fullName }).from(people)
    .innerJoin(mailboxMemberships, eq(mailboxMemberships.personId, people.id))
    .where(and(inArray(people.status, ['active', 'on_leave']), eq(mailboxMemberships.mailboxId, mailboxId),
      eq(mailboxMemberships.capability, 'mailbox.read'),
      sql`julianday(${mailboxMemberships.validFrom})<=julianday('now')`,
      sql`(${mailboxMemberships.validUntil} IS NULL OR julianday(${mailboxMemberships.validUntil})>julianday('now'))`)).limit(100);
}
