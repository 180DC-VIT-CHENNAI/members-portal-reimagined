import { mailUploads } from '@schema';
import type { Context } from 'hono';
import { and, db, eq } from 'void/db';
import { bucket } from '../buckets';
import { CLUB_FILE_TYPES, clubFileProblem, downloadFileHeaders, fileExtension } from '../club-files';
import { badRequest, notFound } from '../http';
import type { Principal } from '../principal';
import { atomic, auditStatement, mailboxFor, requireCapability, statement } from './access';
import { digest } from './rules';

/** Attachments are never served from the shared club-file namespace. */
export async function upload(c: Context, actor: Principal, mailboxId: string) {
  const access = await mailboxFor(actor, mailboxId);
  requireCapability(access, 'mailbox.draft.create');
  if (access.mailbox.status !== 'active') badRequest('mailbox_inactive');
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) badRequest('file_required');
  const problem = clubFileProblem(file);
  if (problem) badRequest(problem);
  // Cloudflare caps the complete MIME message at 5 MiB, including encoding.
  if (file.size > 3 * 1024 * 1024) badRequest('mail_attachment_too_large');
  const id = crypto.randomUUID();
  const key = `mail-files/${mailboxId}/${id}`;
  const bytes = await file.arrayBuffer();
  const checksum = await digest(bytes);
  const contentType = CLUB_FILE_TYPES[fileExtension(file.name)];
  await bucket(c, 'CLUB_FILES').put(key, bytes, { httpMetadata: { contentType } });
  await atomic([
    statement(`INSERT INTO mail_uploads (id,mailbox_id,object_key,filename,content_type,bytes,digest,created_by)
      VALUES (?,?,?,?,?,?,?,?)`, [id, mailboxId, key, file.name, contentType, file.size, checksum, actor.person.id]),
    auditStatement({ mailboxId, actorId: actor.person.id, action: 'mail.attachment.upload', targetId: id }),
  ]);
  return { id, filename: file.name, bytes: file.size, digest: checksum };
}

export async function download(c: Context, actor: Principal, mailboxId: string, fileId: string) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.read');
  const [row] = await db.select().from(mailUploads).where(and(eq(mailUploads.id, fileId), eq(mailUploads.mailboxId, mailboxId)));
  if (!row) notFound();
  const object = await bucket(c, 'CLUB_FILES').get(row.key);
  if (!object) notFound();
  return new Response(object.body, { headers: downloadFileHeaders(row.filename, row.contentType) });
}
