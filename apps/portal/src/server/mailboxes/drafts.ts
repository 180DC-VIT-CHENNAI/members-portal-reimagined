import { mailDrafts, mailDraftSnapshots, mailReviews, mailUploads } from '@schema';
import { and, db, desc, eq, inArray, lt } from 'void/db';
import { badRequest, conflict, forbidden, notFound } from '../http';
import { escapeHtml } from '../html';
import type { Principal } from '../principal';
import { atomic, auditStatement, GRANT_SQL, mailboxFor, requireCapability, statement } from './access';
import { canonicalContent, digest, editable, FOLDER_STATES, recipientsValid } from './rules';
import type { MailFolder, SnapshotContent } from './types';
import type { DraftInput } from './validation';
import { requireReplyContext } from './reply-policy';

export async function draftFor(actor: Principal, mailboxId: string, draftId: string) {
  const access = await mailboxFor(actor, mailboxId);
  requireCapability(access, 'mailbox.read');
  const [draft] = await db.select().from(mailDrafts).where(and(eq(mailDrafts.id, draftId), eq(mailDrafts.mailboxId, mailboxId)));
  if (!draft) notFound();
  const [snapshot] = await db.select().from(mailDraftSnapshots).where(eq(mailDraftSnapshots.id, draft.currentSnapshotId));
  if (!snapshot) conflict('snapshot_unavailable');
  return { ...access, draft, snapshot };
}

export async function listDrafts(actor: Principal, mailboxId: string, query: { readonly before?: string; readonly folder?: MailFolder }) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.read');
  const rows = await db.select({ draft: mailDrafts, subject: mailDraftSnapshots.subject }).from(mailDrafts)
    .innerJoin(mailDraftSnapshots, eq(mailDraftSnapshots.id, mailDrafts.currentSnapshotId))
    .where(and(eq(mailDrafts.mailboxId, mailboxId), query.before ? lt(mailDrafts.id, query.before) : undefined,
      query.folder ? inArray(mailDrafts.state, [...FOLDER_STATES[query.folder]]) : undefined))
    .orderBy(desc(mailDrafts.id)).limit(51);
  const drafts = rows.slice(0, 50);
  return { drafts, nextBefore: rows.length > 50 ? (drafts.at(-1)?.draft.id ?? null) : null };
}

async function snapshotContent(input: { readonly actor: Principal; readonly mailboxId: string; readonly body: DraftInput; readonly conversationId: string | null }) {
  const access = await mailboxFor(input.actor, input.mailboxId);
  if (access.mailbox.status !== 'active') conflict('mailbox_inactive');
  const recipients = { to: input.body.to, cc: input.body.cc, bcc: input.body.bcc };
  if (!recipientsValid(recipients)) badRequest('duplicate_or_excess_recipients');
  if (input.conversationId) {
    requireCapability(access, 'mailbox.read');
    await requireReplyContext({ mailboxId: input.mailboxId, conversationId: input.conversationId, recipients,
      restricted: access.mailbox.repliesOnly || access.mailbox.outboundAdapter === 'cloudflare' });
  }
  if (!access.mailbox.categoryPolicy.includes(input.body.category)) badRequest('category_not_allowed');
  const ids = [...new Set(input.body.attachmentIds)];
  const attachments = ids.length ? await db.select().from(mailUploads)
    .where(and(eq(mailUploads.mailboxId, input.mailboxId), inArray(mailUploads.id, ids))) : [];
  if (attachments.length !== ids.length) badRequest('unknown_attachment');
  if (attachments.reduce((n, row) => n + row.bytes, 0) > 3 * 1024 * 1024) badRequest('attachments_too_large');
  const content: SnapshotContent = {
    mailboxId: input.mailboxId, conversationId: input.conversationId,
    fromAddress: access.mailbox.address, fromName: access.mailbox.displayName,
    recipients, subject: input.body.subject, text: input.body.text,
    html: `<p>${escapeHtml(input.body.text).replace(/\n/g, '<br>')}</p>`,
    signature: access.mailbox.signature, category: input.body.category,
    attachments: attachments.map((a) => ({ id: a.id, key: a.key, filename: a.filename, contentType: a.contentType, bytes: a.bytes, digest: a.digest })),
    templateVersionId: null,
  };
  return { content, hash: await digest(canonicalContent(content)) };
}

function insertSnapshot(input: { readonly draftId: string; readonly snapshotId: string; readonly revision: number; readonly actorId: string; readonly content: SnapshotContent; readonly hash: string }) {
  const c = input.content;
  return statement(`INSERT INTO mail_draft_snapshots
    (id,draft_id,revision,mailbox_id,conversation_id,from_address,from_name,recipients,subject,text,html,signature,category,attachments,template_version_id,content_hash,created_by)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    WHERE EXISTS (SELECT 1 FROM mail_drafts WHERE id=? AND current_snapshot_id=?)`,
  [input.snapshotId, input.draftId, input.revision, c.mailboxId, c.conversationId, c.fromAddress, c.fromName,
    JSON.stringify(c.recipients), c.subject, c.text, c.html, c.signature, c.category, JSON.stringify(c.attachments),
    c.templateVersionId, input.hash, input.actorId, input.draftId, input.snapshotId]);
}

export async function createDraft(actor: Principal, mailboxId: string, input: { readonly body: DraftInput; readonly conversationId: string | null }) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.draft.create');
  const { content, hash } = await snapshotContent({ actor, mailboxId, ...input });
  const id = crypto.randomUUID(), snapshotId = crypto.randomUUID();
  const [result] = await atomic([
    statement(`INSERT INTO mail_drafts (id,mailbox_id,conversation_id,created_by,current_snapshot_id,updated_at)
      SELECT ?,?,?,?,?,? WHERE ${GRANT_SQL}`, [id, mailboxId, input.conversationId, actor.person.id, snapshotId, new Date().toISOString(), actor.person.id, mailboxId, 'mailbox.draft.create']),
    insertSnapshot({ draftId: id, snapshotId, revision: 1, actorId: actor.person.id, content, hash }),
    auditStatement({ mailboxId, actorId: actor.person.id, action: 'mail.draft.create', targetId: id,
      condition: { sql: 'EXISTS(SELECT 1 FROM mail_drafts WHERE id=?)', values: [id] } }),
  ]);
  if (!result.meta.changes) forbidden();
  return { id, revision: 1 };
}

export async function editDraft(actor: Principal, mailboxId: string, draftId: string, body: DraftInput & { readonly revision: number }) {
  const loaded = await draftFor(actor, mailboxId, draftId);
  const capability = loaded.capabilities.includes('mailbox.draft.edit_any') ? 'mailbox.draft.edit_any' : 'mailbox.draft.edit_own';
  requireCapability(loaded, capability);
  if (capability === 'mailbox.draft.edit_own' && loaded.draft.createdBy !== actor.person.id) forbidden();
  if (!editable(loaded.draft.state) || loaded.draft.revision !== body.revision) conflict('draft_changed');
  const { content, hash } = await snapshotContent({ actor, mailboxId, body, conversationId: loaded.draft.conversationId });
  const snapshotId = crypto.randomUUID();
  const [updated] = await atomic([
    statement(`UPDATE mail_drafts SET revision=revision+1,state='draft',current_snapshot_id=?,approved_review_id=NULL,
      active_intent_id=NULL,updated_at=? WHERE id=? AND revision=? AND state IN ('draft','submitted','changes_requested','approved','scheduled','queued')
      AND NOT EXISTS(SELECT 1 FROM mail_send_intents WHERE draft_id=? AND state='sending') AND ${GRANT_SQL}`,
    [snapshotId, new Date().toISOString(), draftId, body.revision, draftId, actor.person.id, mailboxId, capability]),
    insertSnapshot({ draftId, snapshotId, revision: body.revision + 1, actorId: actor.person.id, content, hash }),
    statement(`UPDATE mail_send_intents SET state='cancelled' WHERE draft_id=? AND state IN ('queued','scheduled')
      AND EXISTS(SELECT 1 FROM mail_drafts WHERE id=? AND current_snapshot_id=?)`, [draftId, draftId, snapshotId]),
    auditStatement({ mailboxId, actorId: actor.person.id, action: 'mail.draft.edit', targetId: draftId,
      condition: { sql: 'EXISTS(SELECT 1 FROM mail_drafts WHERE id=? AND current_snapshot_id=?)', values: [draftId, snapshotId] } }),
  ]);
  if (!updated.meta.changes) conflict('draft_changed');
  return { id: draftId, revision: body.revision + 1 };
}

export async function draftHistory(actor: Principal, mailboxId: string, draftId: string) {
  await draftFor(actor, mailboxId, draftId);
  return db.select().from(mailReviews).where(eq(mailReviews.draftId, draftId)).orderBy(desc(mailReviews.createdAt)).limit(100);
}
