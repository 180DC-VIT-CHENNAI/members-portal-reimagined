import { mailSendIntents } from '@schema';
import * as v from 'valibot';
import { and, db, eq } from 'void/db';
import { badRequest, conflict, notFound } from '../http';
import { isUniqueViolation } from '../invitations';
import type { Principal } from '../principal';
import { atomic, auditStatement, GRANT_SQL, mailboxFor, requireCapability, statement } from './access';
import { draftFor } from './drafts';
import { sendInput } from './validation';
import { checkPinned } from '../templates/access';

export async function sendIntent(actor: Principal, mailboxId: string, draftId: string, input: v.InferOutput<typeof sendInput>) {
  const access = await mailboxFor(actor, mailboxId);
  requireCapability(access, 'mailbox.send');
  const [existing] = await db.select().from(mailSendIntents).where(eq(mailSendIntents.idempotencyKey, input.idempotencyKey));
  if (existing) {
    if (existing.mailboxId !== mailboxId || existing.draftId !== draftId || existing.createdBy !== actor.person.id) conflict('idempotency_conflict');
    return { id: existing.id, state: existing.state };
  }
  const loaded = await draftFor(actor, mailboxId, draftId);
  await checkPinned(actor, loaded.snapshot.templateVersionId, 'send', mailboxId, [...loaded.snapshot.recipients.to, ...loaded.snapshot.recipients.cc, ...loaded.snapshot.recipients.bcc]);
  if (loaded.draft.revision !== input.revision || loaded.draft.state !== 'approved' || !loaded.draft.approvedReviewId) conflict('current_approval_required');
  if (input.scheduledAt && Date.parse(input.scheduledAt) <= Date.now()) badRequest('schedule_in_past');
  const intentId = crypto.randomUUID();
  const state = input.scheduledAt ? 'scheduled' : 'queued';
  try {
    const [updated] = await atomic([
      statement(`UPDATE mail_drafts SET active_intent_id=?,state=?,updated_at=? WHERE id=? AND revision=?
        AND state='approved' AND approved_review_id=?
        AND EXISTS(SELECT 1 FROM mailboxes m JOIN mail_reviews r ON r.id=?
          WHERE m.id=? AND m.status='active' AND m.outbound_paused=0 AND m.policy_version=r.policy_version
          AND r.snapshot_id=current_snapshot_id AND r.decision='approved')
        AND NOT EXISTS(SELECT 1 FROM mail_outbound_switch WHERE id=1 AND paused=1) AND ${GRANT_SQL}`,
      [intentId, state, new Date().toISOString(), draftId, input.revision, loaded.draft.approvedReviewId,
        loaded.draft.approvedReviewId, mailboxId, actor.person.id, mailboxId, 'mailbox.send']),
      statement(`INSERT INTO mail_send_intents (id,draft_id,mailbox_id,approved_snapshot_id,approval_review_id,idempotency_key,state,scheduled_at,due_at,created_by)
        SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM mail_drafts WHERE id=? AND active_intent_id=?)`,
      [intentId, draftId, mailboxId, loaded.snapshot.id, loaded.draft.approvedReviewId, input.idempotencyKey,
        state, input.scheduledAt, input.scheduledAt ?? new Date().toISOString(), actor.person.id, draftId, intentId]),
      auditStatement({ mailboxId, actorId: actor.person.id, action: 'mail.intent', targetId: intentId,
        condition: { sql: 'EXISTS(SELECT 1 FROM mail_send_intents WHERE id=?)', values: [intentId] } }),
    ]);
    if (!updated.meta.changes) conflict('approval_changed_or_outbound_paused');
  } catch (error) {
    if (isUniqueViolation(error)) conflict('duplicate_send');
    throw error;
  }
  return { id: intentId, state };
}

export async function intentFor(actor: Principal, mailboxId: string, intentId: string) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.read');
  const [intent] = await db.select().from(mailSendIntents)
    .where(and(eq(mailSendIntents.mailboxId, mailboxId), eq(mailSendIntents.id, intentId)));
  if (!intent) notFound();
  return intent;
}

export async function cancelDraft(actor: Principal, mailboxId: string, draftId: string) {
  const loaded = await draftFor(actor, mailboxId, draftId);
  if (loaded.draft.createdBy === actor.person.id) requireCapability(loaded, 'mailbox.draft.edit_own');
  else requireCapability(loaded, 'mailbox.draft.edit_any');
  const [changed] = await atomic([
    statement(`UPDATE mail_drafts SET state='cancelled',updated_at=? WHERE id=? AND state IN
      ('draft','submitted','changes_requested','approved','scheduled','queued')
      AND NOT EXISTS(SELECT 1 FROM mail_send_intents WHERE draft_id=? AND state='sending')`,
    [new Date().toISOString(), draftId, draftId]),
    statement(`UPDATE mail_send_intents SET state='cancelled' WHERE draft_id=? AND state IN ('queued','scheduled')
      AND EXISTS(SELECT 1 FROM mail_drafts WHERE id=? AND state='cancelled')`, [draftId, draftId]),
    auditStatement({ mailboxId, actorId: actor.person.id, action: 'mail.cancel', targetId: draftId,
      condition: { sql: "EXISTS(SELECT 1 FROM mail_drafts WHERE id=? AND state='cancelled')", values: [draftId] } }),
  ]);
  if (!changed.meta.changes) conflict('cannot_cancel');
  return { id: draftId, state: 'cancelled' };
}
