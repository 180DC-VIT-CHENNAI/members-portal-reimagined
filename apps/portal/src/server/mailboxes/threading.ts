import { mailConversations, mailConversationParticipants, mailMessages } from '@schema';
import { and, db, desc, eq, inArray, or, sql } from 'void/db';
import { statement } from './access';
import { subjectKey } from './inbound-rules';

export async function threadFor(input: {
  readonly mailboxId: string; readonly sender: string; readonly subject: string;
  readonly inReplyTo: string | null; readonly references: readonly string[];
}) {
  const ids = [...new Set([...(input.inReplyTo ? [input.inReplyTo] : []), ...input.references.slice().reverse()])];
  if (ids.length && input.sender) {
    const matches = await db.select({ id: mailMessages.rfcMessageId, provider: mailMessages.providerMessageId, conversationId: mailMessages.conversationId })
      .from(mailMessages).innerJoin(mailConversationParticipants,
        and(eq(mailConversationParticipants.conversationId, mailMessages.conversationId), eq(mailConversationParticipants.address, input.sender)))
      .where(and(eq(mailMessages.mailboxId, input.mailboxId), eq(mailConversationParticipants.mailboxId, input.mailboxId),
        or(inArray(mailMessages.rfcMessageId, ids), inArray(mailMessages.providerMessageId, ids)))).limit(100);
    for (const id of ids) {
      const found = matches.find((m) => m.id === id || m.provider === id);
      if (found?.conversationId) return found.conversationId;
    }
  }
  const key = subjectKey(input.subject);
  if (!key || !input.sender) return null;
  const [fallback] = await db.select({ id: mailConversations.id }).from(mailConversations)
    .innerJoin(mailConversationParticipants, and(eq(mailConversationParticipants.conversationId, mailConversations.id),
      eq(mailConversationParticipants.mailboxId, input.mailboxId), eq(mailConversationParticipants.address, input.sender)))
    .where(and(eq(mailConversations.mailboxId, input.mailboxId), eq(mailConversations.subjectKey, key),
      sql`julianday(${mailConversations.lastMessageAt}) >= julianday('now','-90 days')`))
    .orderBy(desc(mailConversations.lastMessageAt)).limit(1);
  return fallback?.id ?? null;
}

export function conversationStatements(input: {
  readonly mailboxId: string; readonly conversationId: string; readonly subject: string;
  readonly participants: readonly string[]; readonly at: string;
}) {
  return [
    statement(`INSERT INTO mail_conversations(id,mailbox_id,subject,subject_key,last_message_at,last_inbound_at,created_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_message_at=excluded.last_message_at,
      last_inbound_at=excluded.last_inbound_at,status='open'`,
    [input.conversationId, input.mailboxId, input.subject, subjectKey(input.subject), input.at, input.at, input.at]),
    statement(`INSERT OR IGNORE INTO mail_conversation_participants(conversation_id,mailbox_id,address)
      SELECT ?,?,value FROM json_each(?)`, [input.conversationId, input.mailboxId, JSON.stringify(input.participants)]),
  ];
}
