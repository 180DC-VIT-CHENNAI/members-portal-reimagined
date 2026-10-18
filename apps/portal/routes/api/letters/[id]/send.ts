import { emailQueue, letterSends } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, eq, sql } from 'void/db';
import type { QueueAttachment } from '@schema';
import { MAX_LETTER_EMAIL_BYTES } from '../../../../src/lib/letter-kinds';
import { audit } from '../../../../src/server/audit';
import { bucket } from '../../../../src/server/buckets';
import { sender } from '../../../../src/server/email/sender';
import { requirePrincipal } from '../../../../src/server/guard';
import { badRequest, conflict, idParam, notFound } from '../../../../src/server/http';
import { documentFor, requireRecipient } from '../../../../src/server/letters/access';
import { letterMail } from '../../../../src/server/letters/mail';
import { rateLimit } from '../../../../src/server/rate-limit';
import { emailAddress } from '../../../../src/server/validation';

export const POST = defineHandler.withValidator({ body: v.object({ recipientEmail: emailAddress, requestId: v.pipe(v.string(), v.uuid()) }) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const document = await documentFor(actor, idParam(c));
  await requireRecipient(actor, document, body.recipientEmail);
  await rateLimit(c, 'letter_send', 30, 3600);
  const [previous] = await db.select().from(letterSends).where(and(eq(letterSends.createdBy, actor.person.id), eq(letterSends.requestId, body.requestId)));
  if (previous) {
    if (previous.documentId !== document.id || previous.recipient !== body.recipientEmail) conflict('letter_request_reused');
    return { id: previous.id, campaignId: previous.campaignId, queued: 1, replayed: true };
  }
  if (document.bytes > MAX_LETTER_EMAIL_BYTES) badRequest('letter_too_large_for_email');
  if (!(await bucket(c, 'CLUB_FILES').head(document.key))) notFound('letter_file_missing');
  const id = crypto.randomUUID(), campaignId = crypto.randomUUID();
  const mail = letterMail(document.type, document.snapshot, document.docnum);
  const from = sender('180DC Letter Studio');
  const attachments: QueueAttachment[] = [{ key: document.key, filename: document.filename, contentType: 'application/pdf', bucket: 'CLUB_FILES', required: true }];
  const [inserted] = await db.batch([
    db.insert(letterSends).values({ id, documentId: document.id, recipient: body.recipientEmail, requestId: body.requestId, campaignId, createdBy: actor.person.id }).onConflictDoNothing().returning({ id: letterSends.id }),
    db.insert(emailQueue).select(db.select({
      id: sql<string>`${campaignId}`.as('id'), kind: sql<string>`'letter'`.as('kind'), fromAddress: sql<string>`${from}`.as('from_address'),
      subject: sql<string>`${mail.subject}`.as('subject'), html: sql<string>`${mail.html}`.as('html'), attachments: sql<QueueAttachment[]>`${JSON.stringify(attachments)}`.as('attachments'),
      recipients: sql<string[]>`${JSON.stringify([body.recipientEmail])}`.as('recipients'), cursor: sql<number>`0`.as('cursor'), total: sql<number>`1`.as('total'),
      sent: sql<number>`0`.as('sent'), failed: sql<number>`0`.as('failed'), attempts: sql<number>`0`.as('attempts'), status: sql<string>`'pending'`.as('status'), lastError: sql`NULL`.as('last_error'),
      meta: sql<Record<string, unknown>>`${JSON.stringify({ letterSendId: id, replyTo: actor.person.email })}`.as('meta'), createdBy: sql<string>`${actor.person.id}`.as('created_by'),
      createdAt: sql<string>`datetime('now')`.as('created_at'), updatedAt: sql<string>`datetime('now')`.as('updated_at'), finishedAt: sql`NULL`.as('finished_at'),
    }).from(letterSends).where(and(eq(letterSends.id, id), sql`changes() = 1`))),
  ]);
  if (!inserted.length) {
    const [replayed] = await db.select().from(letterSends).where(and(eq(letterSends.createdBy, actor.person.id), eq(letterSends.requestId, body.requestId)));
    if (!replayed || replayed.documentId !== document.id || replayed.recipient !== body.recipientEmail) conflict('letter_request_reused');
    return { id: replayed.id, campaignId: replayed.campaignId, queued: 1, replayed: true };
  }
  await audit(actor.person.id, 'letter.queue', 'letter_document', document.id, { sendId: id, campaignId });
  return { id, campaignId, queued: 1, replayed: false };
});
