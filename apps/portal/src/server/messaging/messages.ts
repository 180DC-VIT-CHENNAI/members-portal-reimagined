import { auditLog, conversationMembers, conversations, messageNotifications, messageReactions, messages, people } from '@schema';
import * as v from 'valibot';
import { and, asc, db, desc, eq, inArray, isNull, lt, sql } from 'void/db';
import { badRequest, conflict, forbidden, notFound } from '../http';
import { editDecision, MESSAGE_MAX_LENGTH, MESSAGE_PAGE_SIZE, plainText, REACTIONS, type Reaction } from '../messaging-rules.ts';
import type { Principal } from '../principal';
import { accessibleConversations, conversationColumns, type Conversation } from './access';
import { notifyMentions } from './notices';

const cursor = v.optional(v.pipe(v.string(), v.regex(/^[1-9]\d{0,14}$/, 'invalid_cursor'), v.transform(Number)));
const messageId = v.pipe(v.number(), v.integer(), v.minValue(1));
const body = v.pipe(v.string(), v.maxLength(MESSAGE_MAX_LENGTH), v.trim(), v.minLength(1));

export const pageQuery = v.object({ before: cursor });
export const sendInput = v.object({ requestId: v.pipe(v.string(), v.uuid()), body, replyToId: v.optional(messageId) });
export const editInput = v.object({ body });
export const reactionInput = v.object({ emoji: v.picklist(REACTIONS) });
export const readInput = v.object({ upTo: messageId });
export const muteInput = v.object({ muted: v.boolean() });
export const searchQuery = v.object({
  q: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(100)),
  before: cursor,
});

/** The `[messageId]` route parameter as a message of this conversation, or 404. */
export async function messageOr404(conversationId: string, raw: string) {
  const idValue = Number(raw);
  const [row] = Number.isSafeInteger(idValue) && idValue > 0
    ? await db.select().from(messages).where(and(eq(messages.id, idValue), eq(messages.conversationId, conversationId))).limit(1)
    : [];
  return row ?? notFound('message_not_found');
}

/** Reaction counts per message, and whether the caller is among them. */
async function reactionsFor(principal: Principal, ids: readonly number[]) {
  if (!ids.length) return new Map<number, { emoji: Reaction; count: number; mine: boolean }[]>();
  const rows = await db
    .select({
      messageId: messageReactions.messageId,
      emoji: messageReactions.emoji,
      count: sql<number>`count(*)`,
      mine: sql<number>`max(${messageReactions.personId} = ${principal.person.id})`,
    })
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, [...ids]))
    .groupBy(messageReactions.messageId, messageReactions.emoji)
    .orderBy(asc(messageReactions.emoji));
  const out = new Map<number, { emoji: Reaction; count: number; mine: boolean }[]>();
  for (const row of rows) out.set(row.messageId, [...(out.get(row.messageId) ?? []), { emoji: row.emoji, count: row.count, mine: Boolean(row.mine) }]);
  return out;
}

/**
 * Messages newest first, 50 at a time. A deleted message keeps its place with
 * `body: null`; a reply carries a short plain-text preview of what it answers
 * (null once that message is deleted).
 */
export async function messagesPage(principal: Principal, conversation: Conversation, before: number | undefined) {
  const rows = await db
    .select({
      id: messages.id,
      authorId: messages.authorId,
      authorName: people.fullName,
      body: messages.body,
      replyToId: messages.replyToId,
      createdAt: messages.createdAt,
      editedAt: messages.editedAt,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .innerJoin(people, eq(people.id, messages.authorId))
    .where(and(eq(messages.conversationId, conversation.id), before ? lt(messages.id, before) : undefined))
    .orderBy(desc(messages.id))
    .limit(MESSAGE_PAGE_SIZE + 1);
  const page = rows.slice(0, MESSAGE_PAGE_SIZE);
  const replyIds = [...new Set(page.flatMap((row) => (row.replyToId ? [row.replyToId] : [])))];
  const replies = replyIds.length
    ? await db
        .select({ id: messages.id, authorName: people.fullName, body: messages.body, deletedAt: messages.deletedAt })
        .from(messages)
        .innerJoin(people, eq(people.id, messages.authorId))
        .where(and(eq(messages.conversationId, conversation.id), inArray(messages.id, replyIds)))
    : [];
  const replyById = new Map(replies.map((reply) => [reply.id, reply]));
  const reactions = await reactionsFor(principal, page.map((row) => row.id));
  return {
    messages: page.map(({ body: text, deletedAt, ...row }) => {
      const reply = row.replyToId ? replyById.get(row.replyToId) : undefined;
      return {
        ...row,
        body: deletedAt ? null : text,
        deleted: Boolean(deletedAt),
        mine: row.authorId === principal.person.id,
        replyTo: reply ? { id: reply.id, authorName: reply.authorName, preview: reply.deletedAt ? null : plainText(reply.body).slice(0, 140) } : null,
        reactions: deletedAt ? [] : (reactions.get(row.id) ?? []),
      };
    }),
    nextBefore: rows.length > MESSAGE_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Move the caller's read pointer forward (never back, never past the newest message). */
export async function markConversationRead(principal: Principal, conversation: Conversation, upTo: number) {
  const pointer = Math.min(upTo, conversation.lastMessageId ?? 0);
  await db.batch([
    db
      .insert(conversationMembers)
      .values({ conversationId: conversation.id, personId: principal.person.id, lastReadMessageId: pointer })
      .onConflictDoUpdate({
        target: [conversationMembers.conversationId, conversationMembers.personId],
        set: { lastReadMessageId: sql`max(${conversationMembers.lastReadMessageId}, excluded.last_read_message_id)` },
      }),
    db
      .update(messageNotifications)
      .set({ readAt: sql`datetime('now')` })
      .where(
        and(
          eq(messageNotifications.recipientId, principal.person.id),
          eq(messageNotifications.conversationId, conversation.id),
          sql`${messageNotifications.messageId} <= ${pointer}`,
          isNull(messageNotifications.readAt),
        ),
      ),
  ]);
}

export async function setMuted(principal: Principal, conversation: Conversation, muted: boolean) {
  await db
    .insert(conversationMembers)
    .values({ conversationId: conversation.id, personId: principal.person.id, muted })
    .onConflictDoUpdate({ target: [conversationMembers.conversationId, conversationMembers.personId], set: { muted } });
}

/**
 * Post a message. A direct conversation whose other person has left is read
 * only (409). Repeating a requestId returns the first message; reusing it for
 * other text is a 409. Mentions notify only people who can read the
 * conversation, and replays never notify twice.
 */
export async function sendMessage(principal: Principal, conversation: Conversation, input: v.InferOutput<typeof sendInput>) {
  if (!conversation.canSend) conflict('conversation_read_only');
  if (input.replyToId) {
    const [target] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, input.replyToId), eq(messages.conversationId, conversation.id)))
      .limit(1);
    if (!target) badRequest('invalid_reply');
  }
  const [inserted] = await db
    .insert(messages)
    .values({ conversationId: conversation.id, authorId: principal.person.id, body: input.body, replyToId: input.replyToId ?? null, requestId: input.requestId })
    .onConflictDoNothing()
    .returning({ id: messages.id });
  let id = inserted?.id;
  if (!id) {
    const [earlier] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.authorId, principal.person.id), eq(messages.requestId, input.requestId)));
    if (!earlier || earlier.conversationId !== conversation.id || earlier.body !== input.body || earlier.replyToId !== (input.replyToId ?? null) || earlier.deletedAt) conflict('request_reused');
    id = earlier.id;
  }
  await db.batch([
    db.update(conversations).set({ lastMessageId: sql`max(coalesce(${conversations.lastMessageId}, 0), ${id})` }).where(eq(conversations.id, conversation.id)),
    db
      .insert(conversationMembers)
      .values({ conversationId: conversation.id, personId: principal.person.id, lastReadMessageId: id })
      .onConflictDoUpdate({
        target: [conversationMembers.conversationId, conversationMembers.personId],
        set: { lastReadMessageId: sql`max(${conversationMembers.lastReadMessageId}, excluded.last_read_message_id)` },
      }),
  ]);
  await notifyMentions(principal, conversation.id, id, input.body);
  return { id, replayed: !inserted };
}

/** Edit your own message within 15 minutes of sending it; newly mentioned readers are told. */
export async function editMessage(principal: Principal, conversation: Conversation, message: typeof messages.$inferSelect, text: string) {
  const decision = editDecision(message, principal.person.id, Date.now());
  switch (decision) {
    case 'ok':
      break;
    case 'not_author':
      forbidden();
    case 'deleted':
      conflict('message_deleted');
    case 'window_closed':
      conflict('edit_window_closed');
    default: {
      const unhandled: never = decision;
      throw new Error(`Unhandled edit decision: ${String(unhandled)}`);
    }
  }
  await db.update(messages).set({ body: text, editedAt: new Date().toISOString() }).where(and(eq(messages.id, message.id), isNull(messages.deletedAt)));
  await notifyMentions(principal, conversation.id, message.id, text);
  return { id: message.id };
}

/**
 * Leave a tombstone: the body is erased, reactions and mention notices go.
 * Authors delete their own; moderators remove through reports (audited).
 */
export async function tombstone(messageIdValue: number, moderator?: { actorId: string; conversationId: string }) {
  await db.batch([
    db.update(messages).set({ body: '', deletedAt: new Date().toISOString() }).where(and(eq(messages.id, messageIdValue), isNull(messages.deletedAt))),
    db.delete(messageReactions).where(eq(messageReactions.messageId, messageIdValue)),
    db.delete(messageNotifications).where(eq(messageNotifications.messageId, messageIdValue)),
    ...(moderator
      ? [db.insert(auditLog).values({
          actorPersonId: moderator.actorId,
          action: 'message.remove',
          targetType: 'message',
          targetId: String(messageIdValue),
          details: { conversationId: moderator.conversationId },
        })]
      : []),
  ]);
}

export async function deleteOwnMessage(principal: Principal, message: typeof messages.$inferSelect) {
  if (message.authorId !== principal.person.id) forbidden();
  if (!message.deletedAt) await tombstone(message.id);
  return { id: message.id };
}

export async function toggleReaction(principal: Principal, message: typeof messages.$inferSelect, emoji: Reaction) {
  if (message.deletedAt) conflict('message_deleted');
  const removed = await db
    .delete(messageReactions)
    .where(and(eq(messageReactions.messageId, message.id), eq(messageReactions.personId, principal.person.id), eq(messageReactions.emoji, emoji)))
    .returning({ emoji: messageReactions.emoji });
  if (!removed.length) await db.insert(messageReactions).values({ messageId: message.id, personId: principal.person.id, emoji }).onConflictDoNothing();
  return { reactions: (await reactionsFor(principal, [message.id])).get(message.id) ?? [] };
}

/** Live messages containing `q` in conversations the caller can read now, newest first, 30 at a time. */
export async function searchMessages(principal: Principal, query: v.InferOutput<typeof searchQuery>) {
  const columns = conversationColumns(principal);
  const rows = await db
    .select({
      id: messages.id,
      conversationId: conversations.id,
      kind: conversations.kind,
      title: columns.title,
      authorName: people.fullName,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(people, eq(people.id, messages.authorId))
    .where(
      and(
        accessibleConversations(principal),
        isNull(messages.deletedAt),
        // instr, not LIKE: D1 rejects LIKE patterns longer than 50 bytes.
        sql`instr(lower(${messages.body}), lower(${query.q})) > 0`,
        query.before ? lt(messages.id, query.before) : undefined,
      ),
    )
    .orderBy(desc(messages.id))
    .limit(31);
  const page = rows.slice(0, 30);
  return {
    results: page.map(({ body: text, ...row }) => ({ ...row, snippet: plainText(text).slice(0, 200) })),
    nextBefore: rows.length > 30 ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Unread messages from others across the caller's readable, unmuted conversations, counting at most 99. */
export async function unreadMessages(principal: Principal) {
  const columns = conversationColumns(principal);
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        accessibleConversations(principal),
        sql`${messages.authorId} <> ${principal.person.id}`,
        isNull(messages.deletedAt),
        sql`${messages.id} > ${columns.lastRead}`,
        sql`${columns.muted} = 0`,
      ),
    )
    .limit(100);
  return { unread: Math.min(rows.length, 99), capped: rows.length > 99 };
}
