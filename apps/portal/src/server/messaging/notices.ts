import { conversationMembers, conversations, messageNotifications, messages, notificationPreferences, people } from '@schema';
import * as v from 'valibot';
import { and, db, desc, eq, inArray, isNull, lt, lte } from 'void/db';
import { parseMentions, plainText } from '../messaging-rules.ts';
import { loadPersonPrincipal, type Principal } from '../principal';
import { accessibleConversations, canRead, conversationColumns } from './access';

/**
 * Tell people mentioned in a message, once per message: only current members
 * who can read the conversation now, who have not muted it and have not
 * turned off in-app mention notices. Never the author.
 */
export async function notifyMentions(author: Principal, conversationId: string, messageId: number, body: string) {
  const mentioned = parseMentions(body).filter((personId) => personId !== author.person.id);
  if (!mentioned.length) return;
  const [muted, off] = await Promise.all([
    db
      .select({ personId: conversationMembers.personId })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, conversationId), inArray(conversationMembers.personId, mentioned), eq(conversationMembers.muted, true))),
    db
      .select({ personId: notificationPreferences.personId })
      .from(notificationPreferences)
      .where(and(eq(notificationPreferences.category, 'mentions'), eq(notificationPreferences.inApp, false), inArray(notificationPreferences.personId, mentioned))),
  ]);
  const skip = new Set([...muted, ...off].map((row) => row.personId));
  const recipients: string[] = [];
  for (const personId of mentioned) {
    if (skip.has(personId)) continue;
    const principal = await loadPersonPrincipal(personId);
    if (principal && (await canRead(principal, conversationId))) recipients.push(personId);
  }
  if (!recipients.length) return;
  for (let start = 0; start < recipients.length; start += 15) {
    await db
      .insert(messageNotifications)
      .values(recipients.slice(start, start + 15).map((recipientId) => ({ recipientId, kind: 'message_mention' as const, conversationId, messageId, actorId: author.person.id })))
      .onConflictDoNothing();
  }
}

const mine = (principal: Principal) =>
  and(eq(messageNotifications.recipientId, principal.person.id), accessibleConversations(principal), isNull(messages.deletedAt));

export const mentionsQuery = v.object({
  before: v.optional(v.pipe(v.string(), v.regex(/^[1-9]\d{0,14}$/, 'invalid_cursor'), v.transform(Number))),
  unread: v.optional(v.picklist(['1'])),
});

/** Mention notices still readable by the caller (conversation access and live message rechecked), newest first, 30 at a time. */
export async function mentionInbox(principal: Principal, query: v.InferOutput<typeof mentionsQuery>) {
  const rows = await db
    .select({
      id: messageNotifications.id,
      kind: messageNotifications.kind,
      conversationId: conversations.id,
      conversationTitle: conversationColumns(principal).title,
      messageId: messages.id,
      body: messages.body,
      actorName: people.fullName,
      createdAt: messageNotifications.createdAt,
      readAt: messageNotifications.readAt,
    })
    .from(messageNotifications)
    .innerJoin(conversations, eq(conversations.id, messageNotifications.conversationId))
    .innerJoin(messages, eq(messages.id, messageNotifications.messageId))
    .leftJoin(people, eq(people.id, messageNotifications.actorId))
    .where(and(mine(principal), query.before ? lt(messageNotifications.id, query.before) : undefined, query.unread ? isNull(messageNotifications.readAt) : undefined))
    .orderBy(desc(messageNotifications.id))
    .limit(31);
  const page = rows.slice(0, 30);
  return {
    mentions: page.map(({ body, ...row }) => ({ ...row, preview: plainText(body).slice(0, 140) })),
    nextBefore: rows.length > 30 ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Unread mention notices the caller can still see, reading at most `limit` rows. */
export async function unreadMentionRows(principal: Principal, limit: number): Promise<number> {
  const rows = await db
    .select({ id: messageNotifications.id })
    .from(messageNotifications)
    .innerJoin(conversations, eq(conversations.id, messageNotifications.conversationId))
    .innerJoin(messages, eq(messages.id, messageNotifications.messageId))
    .where(and(mine(principal), isNull(messageNotifications.readAt)))
    .limit(limit);
  return rows.length;
}

const noticeId = v.pipe(v.number(), v.integer(), v.minValue(1));
export const markMentionsInput = v.union([
  v.object({ ids: v.pipe(v.array(noticeId), v.minLength(1), v.maxLength(50)) }),
  v.object({ upTo: noticeId }),
]);

/** Mark the caller's own mention notices read; anyone else's ids match nothing. */
export async function markMentionsRead(principal: Principal, input: v.InferOutput<typeof markMentionsInput>) {
  await db
    .update(messageNotifications)
    .set({ readAt: new Date().toISOString() })
    .where(
      and(
        eq(messageNotifications.recipientId, principal.person.id),
        isNull(messageNotifications.readAt),
        'ids' in input ? inArray(messageNotifications.id, input.ids) : lte(messageNotifications.id, input.upTo),
      ),
    );
}
