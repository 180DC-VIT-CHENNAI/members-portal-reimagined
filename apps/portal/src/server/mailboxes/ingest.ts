import { mailboxes, mailInboundEvents } from '@schema';
import { and, db, eq, or, sql } from 'void/db';
import { isUniqueViolation } from '../invitations';
import { atomic, auditStatement, statement } from './access';
import { contentIdentity, externalParticipants, normalizedAddress } from './inbound-rules';
import { MAX_INBOUND_BYTES, type InboxBucket } from './inbox-types';
import { parseInbound } from './mime';
import { digest } from './rules';
import { conversationStatements, threadFor } from './threading';
import { notifyInbound } from './notices';

export type RawDelivery = { readonly from: string; readonly to: string; readonly raw: ArrayBuffer };
export type IngestResult =
  | { readonly state: 'rejected'; readonly reason: string }
  | { readonly state: 'duplicate' }
  | { readonly state: 'received' | 'quarantined'; readonly messageId: string; readonly conversationId: string | null };

export async function ingestInbound(input: RawDelivery, storage: InboxBucket): Promise<IngestResult> {
  const recipient = normalizedAddress(input.to);
  const [mailbox] = recipient ? await db.select().from(mailboxes).where(and(
    sql`lower(${mailboxes.address})=${recipient}`, eq(mailboxes.status, 'active'), eq(mailboxes.inboundEnabled, true),
  )).limit(1) : [];
  if (!mailbox) return { state: 'rejected', reason: 'Mailbox unavailable' };
  if (input.raw.byteLength > MAX_INBOUND_BYTES) return { state: 'rejected', reason: 'Message exceeds 25 MiB' };
  const rawSha256 = await digest(input.raw), contentKey = await contentIdentity(input);
  const [duplicate] = await db.select({ id: mailInboundEvents.id }).from(mailInboundEvents).where(and(
    eq(mailInboundEvents.mailboxId, mailbox.id),
    or(eq(mailInboundEvents.rawSha256, rawSha256), eq(mailInboundEvents.contentKey, contentKey)),
  )).limit(1);
  if (duplicate) return { state: 'duplicate' };
  const id = crypto.randomUUID(), at = new Date().toISOString();
  const rawKey = `mail-raw/${mailbox.id}/${rawSha256}`;
  // Await durable original storage before making its metadata visible.
  await storage.put(rawKey, input.raw, { httpMetadata: { contentType: 'message/rfc822' } });
  const parsed = await parseInbound(input);
  const quarantined = parsed.quarantineReason !== null;
  const participants = externalParticipants([parsed.from, ...parsed.to, ...parsed.cc, ...parsed.replyTo], mailbox.address);
  const conversationId = quarantined ? null : await threadFor({
    mailboxId: mailbox.id, sender: parsed.from.address, subject: parsed.subject,
    inReplyTo: parsed.inReplyTo, references: parsed.references,
  }) ?? crypto.randomUUID();
  const htmlKey = parsed.html ? `mail-inbound/${mailbox.id}/${id}/body.html` : null;
  if (htmlKey) await storage.put(htmlKey, parsed.html, { httpMetadata: { contentType: 'text/plain' } });
  const attachments = [];
  for (const attachment of parsed.attachments) {
    const attachmentId = crypto.randomUUID(), key = `mail-inbound/${mailbox.id}/${id}/${attachmentId}`;
    await storage.put(key, attachment.bytes, { httpMetadata: { contentType: 'application/octet-stream' } });
    attachments.push({ id: attachmentId, key, ...attachment, sha256: await digest(attachment.bytes) });
  }
  try {
    await atomic([
      statement(`INSERT INTO mail_inbound_events(id,mailbox_id,raw_sha256,content_key,message_id,created_at)
        VALUES(?,?,?,?,?,?)`, [crypto.randomUUID(), mailbox.id, rawSha256, contentKey, id, at]),
      ...(conversationId ? conversationStatements({ mailboxId: mailbox.id, conversationId, subject: parsed.subject, participants, at }) : []),
      statement(`INSERT INTO mail_messages(id,mailbox_id,conversation_id,direction,status,quarantine_reason,
        rfc_message_id,in_reply_to,references_json,envelope_from,envelope_to,from_json,to_json,cc_json,reply_to_json,
        subject,text,html_object_key,raw_object_key,raw_sha256,raw_size,auth_signals,received_at)
        VALUES(?,?,?,'in',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, mailbox.id, conversationId, quarantined ? 'quarantined' : 'received', parsed.quarantineReason, parsed.rfcMessageId,
        parsed.inReplyTo, JSON.stringify(parsed.references), input.from.slice(0, 320), recipient,
        JSON.stringify(parsed.from), JSON.stringify(parsed.to), JSON.stringify(parsed.cc), JSON.stringify(parsed.replyTo),
        parsed.subject, parsed.text, htmlKey, rawKey, rawSha256, input.raw.byteLength, parsed.authSignals, at]),
      ...attachments.map((a) => statement(`INSERT INTO mail_attachments
        (id,mailbox_id,message_id,object_key,filename,mime,size,sha256,content_id,inline,quarantine_status)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [a.id, mailbox.id, id, a.key, a.filename, a.mime, a.bytes.byteLength, a.sha256,
        a.contentId, a.inline ? 1 : 0, a.allowed ? 'allowed' : 'quarantined'])),
      ...(!quarantined ? [notifyInbound(id)] : []),
      auditStatement({ mailboxId: mailbox.id, actorId: null, action: quarantined ? 'mail.inbound.quarantined' : 'mail.inbound.received', targetId: id }),
    ]);
  } catch (error) {
    // A simultaneous delivery can win the unique event identity. The batch rolls back.
    if (isUniqueViolation(error)) return { state: 'duplicate' };
    throw error;
  }
  return { state: quarantined ? 'quarantined' : 'received', messageId: id, conversationId };
}
