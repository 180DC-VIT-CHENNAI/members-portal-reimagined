import { mailAttachments, mailMessages } from '@schema';
import type { Context } from 'hono';
import { and, db, desc, eq } from 'void/db';
import { bucket } from '../buckets';
import { conflict, notFound } from '../http';
import type { Principal } from '../principal';
import { atomic, auditStatement, mailboxFor, requireCapability, statement } from './access';
import { externalParticipants, subjectKey } from './inbound-rules';
import { threadFor } from './threading';
import { notifyInbound } from './notices';

async function quarantinedFor(actor: Principal, mailboxId: string, messageId: string) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.manage');
  const [message] = await db.select().from(mailMessages).where(and(eq(mailMessages.id, messageId),
    eq(mailMessages.mailboxId, mailboxId), eq(mailMessages.status, 'quarantined')));
  if (!message) notFound();
  return message;
}

export async function listQuarantine(actor: Principal, mailboxId: string) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.manage');
  return db.select({ id: mailMessages.id, subject: mailMessages.subject, from: mailMessages.from,
    receivedAt: mailMessages.receivedAt, reason: mailMessages.quarantineReason, size: mailMessages.rawSize })
    .from(mailMessages).where(and(eq(mailMessages.mailboxId, mailboxId), eq(mailMessages.status, 'quarantined')))
    .orderBy(desc(mailMessages.receivedAt)).limit(50);
}

export async function quarantineHeaders(c: Context, actor: Principal, input: { readonly mailboxId: string; readonly messageId: string }) {
  const message = await quarantinedFor(actor, input.mailboxId, input.messageId);
  const object = message.rawKey ? await bucket(c, 'CLUB_FILES').get(message.rawKey, { range: { offset: 0, length: Math.min(message.rawSize, 65_536) } }) : null;
  if (!object) notFound();
  const headers = (await object.text()).split(/\r?\n\r?\n/, 1)[0];
  return { id: message.id, headers, reason: message.quarantineReason, rawSha256: message.rawSha256, size: message.rawSize };
}

export async function releaseQuarantine(actor: Principal, mailboxId: string, messageId: string) {
  const message = await quarantinedFor(actor, mailboxId, messageId);
  const conversationId = await threadFor({
    mailboxId, sender: message.from.address, subject: message.subject, inReplyTo: message.inReplyTo, references: message.references,
  }) ?? crypto.randomUUID();
  const at = new Date().toISOString();
  const participants = externalParticipants([message.from, ...message.to, ...message.cc, ...message.replyTo], message.envelopeTo);
  const condition = `EXISTS(SELECT 1 FROM mail_messages WHERE id=? AND mailbox_id=? AND status='quarantined')`;
  const [created, _participants, changed] = await atomic([
    statement(`INSERT INTO mail_conversations(id,mailbox_id,subject,subject_key,last_message_at,last_inbound_at,created_at)
      SELECT ?,?,?,?,?,?,? WHERE ${condition} ON CONFLICT(id) DO UPDATE SET status='open',
      last_message_at=excluded.last_message_at,last_inbound_at=excluded.last_inbound_at`,
    [conversationId, mailboxId, message.subject, subjectKey(message.subject), at, at, at, messageId, mailboxId]),
    statement(`INSERT OR IGNORE INTO mail_conversation_participants(conversation_id,mailbox_id,address)
      SELECT ?,?,value FROM json_each(?) WHERE ${condition}`, [conversationId, mailboxId, JSON.stringify(participants), messageId, mailboxId]),
    statement(`UPDATE mail_messages SET status='received',conversation_id=?,received_at=?
      WHERE id=? AND mailbox_id=? AND status='quarantined'`, [conversationId, at, messageId, mailboxId]),
    notifyInbound(messageId),
    auditStatement({ mailboxId, actorId: actor.person.id, action: 'mail.quarantine.release', targetId: messageId }),
  ]);
  if (!created.meta.changes || !changed.meta.changes) conflict('quarantine_changed');
  return { conversationId };
}

export async function deleteQuarantine(c: Context, actor: Principal, input: { readonly mailboxId: string; readonly messageId: string }) {
  const message = await quarantinedFor(actor, input.mailboxId, input.messageId);
  const files = await db.select({ key: mailAttachments.key }).from(mailAttachments)
    .where(and(eq(mailAttachments.mailboxId, input.mailboxId), eq(mailAttachments.messageId, input.messageId)));
  const keys = [message.rawKey, message.htmlKey, ...files.map((f) => f.key)].filter((k): k is string => k !== null);
  await bucket(c, 'CLUB_FILES').delete(keys);
  await atomic([
    statement('DELETE FROM mail_attachments WHERE message_id=? AND mailbox_id=?', [input.messageId, input.mailboxId]),
    statement('UPDATE mail_inbound_events SET message_id=NULL WHERE message_id=? AND mailbox_id=?', [input.messageId, input.mailboxId]),
    statement("DELETE FROM mail_messages WHERE id=? AND mailbox_id=? AND status='quarantined'", [input.messageId, input.mailboxId]),
    auditStatement({ mailboxId: input.mailboxId, actorId: actor.person.id, action: 'mail.quarantine.delete', targetId: input.messageId }),
  ]);
  return { deleted: true };
}
