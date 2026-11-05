import { mailConversationParticipants, mailConversations } from '@schema';
import { and, db, eq } from 'void/db';
import { badRequest, notFound } from '../http';
import type { MailRecipients } from './types';

export async function replyRecipientsAllowed(input: {
  readonly mailboxId: string; readonly conversationId: string; readonly recipients: MailRecipients;
}): Promise<boolean> {
  const [conversation] = await db.select({ id: mailConversations.id }).from(mailConversations)
    .where(and(eq(mailConversations.id, input.conversationId), eq(mailConversations.mailboxId, input.mailboxId)));
  if (!conversation) return false;
  const participants = await db.select({ address: mailConversationParticipants.address }).from(mailConversationParticipants)
    .where(and(eq(mailConversationParticipants.mailboxId, input.mailboxId), eq(mailConversationParticipants.conversationId, input.conversationId)));
  const known = new Set(participants.map((p) => p.address));
  return [...input.recipients.to, ...input.recipients.cc, ...input.recipients.bcc].every((a) => known.has(a));
}

export async function requireReplyContext(input: {
  readonly mailboxId: string; readonly conversationId: string; readonly recipients: MailRecipients; readonly restricted: boolean;
}) {
  const [conversation] = await db.select().from(mailConversations).where(and(
    eq(mailConversations.id, input.conversationId), eq(mailConversations.mailboxId, input.mailboxId)));
  if (!conversation) notFound();
  if (input.restricted && !await replyRecipientsAllowed(input)) badRequest('reply_recipients_must_be_thread_participants');
}
