import { mailConversationNotes, mailConversationReads, mailConversations, people, mailboxMemberships } from '@schema';
import * as v from 'valibot';
import { and, db, eq, inArray } from 'void/db';
import { badRequest, forbidden } from '../http';
import type { Principal } from '../principal';
import { activeGrant, atomic, auditStatement, GRANT_SQL, requireCapability, statement } from './access';
import { createDraft } from './drafts';
import { conversationFor, messageFor } from './inbox-read';
import type { triageInput } from './inbox-validation';
import { notifyAssignment } from './notices';

export async function triageConversation(actor: Principal, input: {
  readonly mailboxId: string; readonly conversationId: string; readonly body: v.InferOutput<typeof triageInput>;
}) {
  const access = await conversationFor(actor, input.mailboxId, input.conversationId);
  requireCapability(access, 'mailbox.assign');
  if (input.body.assignedTo) {
    const [eligible] = await db.select({ id: people.id }).from(people)
      .innerJoin(mailboxMemberships, eq(mailboxMemberships.personId, people.id))
      .where(and(eq(people.id, input.body.assignedTo), inArray(people.status, ['active', 'on_leave']),
        activeGrant(input.body.assignedTo, input.mailboxId, 'mailbox.read'))).limit(1);
    if (!eligible) badRequest('assignee_must_have_mailbox_read');
  }
  const current = access.conversation, b = input.body;
  const assignee = b.assignedTo === undefined ? current.assignedTo : b.assignedTo;
  const [changed] = await atomic([
    statement(`UPDATE mail_conversations SET status=?,priority=?,tags=?,assigned_to=?,due_for_reply_at=?
      WHERE id=? AND mailbox_id=? AND ${GRANT_SQL}
      AND (? IS NULL OR ${GRANT_SQL})`,
    [b.status ?? current.status, b.priority ?? current.priority, JSON.stringify(b.tags ?? current.tags), assignee,
      b.dueForReplyAt === undefined ? current.dueForReplyAt : b.dueForReplyAt, input.conversationId, input.mailboxId,
      actor.person.id, input.mailboxId, 'mailbox.assign', assignee, assignee, input.mailboxId, 'mailbox.read']),
    ...(assignee && assignee !== current.assignedTo && assignee !== actor.person.id ? [notifyAssignment({
      mailboxId: input.mailboxId, conversationId: input.conversationId, assignee, previous: current.assignedTo,
    })] : []),
    auditStatement({ mailboxId: input.mailboxId, actorId: actor.person.id, action: 'mail.conversation.triage', targetId: input.conversationId }),
  ]);
  if (!changed.meta.changes) forbidden();
  return { id: input.conversationId };
}

export async function markConversationRead(actor: Principal, mailboxId: string, conversationId: string) {
  const { conversation } = await conversationFor(actor, mailboxId, conversationId);
  await db.insert(mailConversationReads).values({ conversationId, personId: actor.person.id, readAt: conversation.lastInboundAt })
    .onConflictDoUpdate({ target: [mailConversationReads.conversationId, mailConversationReads.personId], set: { readAt: conversation.lastInboundAt } });
  return { read: true };
}

export async function addConversationNote(actor: Principal, input: {
  readonly mailboxId: string; readonly conversationId: string; readonly body: string;
}) {
  const access = await conversationFor(actor, input.mailboxId, input.conversationId);
  const capability = access.capabilities.includes('mailbox.assign') ? 'mailbox.assign' : 'mailbox.draft.create';
  requireCapability(access, capability);
  const id = crypto.randomUUID();
  const [inserted] = await atomic([
    statement(`INSERT INTO mail_conversation_notes(id,conversation_id,mailbox_id,author_id,body,created_at)
      SELECT ?,?,?,?,?,? WHERE ${GRANT_SQL}`, [id, input.conversationId, input.mailboxId, actor.person.id,
      input.body, new Date().toISOString(), actor.person.id, input.mailboxId, capability]),
    auditStatement({ mailboxId: input.mailboxId, actorId: actor.person.id, action: 'mail.note.create', targetId: id }),
  ]);
  if (!inserted.meta.changes) forbidden();
  return { id };
}

export async function createReply(actor: Principal, input: {
  readonly mailboxId: string; readonly conversationId: string; readonly messageId: string;
}) {
  const access = await conversationFor(actor, input.mailboxId, input.conversationId);
  requireCapability(access, 'mailbox.draft.create');
  const message = await messageFor(actor, input.mailboxId, input.conversationId, input.messageId);
  if (message.direction !== 'in') badRequest('reply_to_inbound_message_required');
  const target = message.replyTo[0]?.address ?? message.from.address;
  if (!target) badRequest('no_reply_address');
  return createDraft(actor, input.mailboxId, {
    conversationId: input.conversationId,
    body: { to: [target], cc: [], bcc: [], subject: `Re: ${message.subject.replace(/^re:\s*/i, '')}`.slice(0, 300),
      text: `\n\n--- ${message.from.address} wrote ---\n${message.text.slice(0, 10_000)}`, attachmentIds: [], category: 'correspondence' },
  });
}
