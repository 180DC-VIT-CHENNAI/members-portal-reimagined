import { mailboxes, mailDrafts, mailDraftSnapshots, mailReviews, mailSendIntents, emailHourCount } from '@schema';
import { env } from 'cloudflare:workers';
import { and, db, eq, inArray, lte, sql } from 'void/db';
import type { Attachment } from 'void/email';
import { emailQuota, emailTestMode } from '../email/send';
import { atomic, auditStatement, GRANT_SQL, statement } from './access';
import { canonicalContent, digest } from './rules';
import { mailboxTransport, type TransportOutcome } from './transport';

/** A claim whose execution vanished is uncertain, never automatically replayed. */
async function recoverAbandoned() {
  await atomic([
    statement(`UPDATE mail_send_intents SET state='outcome_unknown',last_error='INTERRUPTED_ATTEMPT'
      WHERE state='sending' AND julianday(claimed_at) < julianday('now','-15 minutes')`),
    statement(`UPDATE mail_send_attempts SET outcome='outcome_unknown',error_code='INTERRUPTED_ATTEMPT',finished_at=?
      WHERE outcome='started' AND intent_id IN (SELECT id FROM mail_send_intents WHERE state='outcome_unknown')`, [new Date().toISOString()]),
    statement(`UPDATE mail_drafts SET state='outcome_unknown'
      WHERE state='sending' AND active_intent_id IN (SELECT id FROM mail_send_intents WHERE state='outcome_unknown')`),
  ]);
}

async function finish(input: { readonly intentId: string; readonly claimToken: string; readonly outcome: TransportOutcome }) {
  const { outcome } = input;
  await atomic([
    statement(`UPDATE mail_send_intents SET state=?,provider_message_id=?,last_error=? WHERE id=? AND state='sending' AND claim_token=?`,
      [outcome.state, outcome.messageId, outcome.code, input.intentId, input.claimToken]),
    statement(`UPDATE mail_send_attempts SET outcome=?,provider_message_id=?,error_code=?,finished_at=?,recipient_results=?
      WHERE intent_id=? AND outcome='started' AND EXISTS(SELECT 1 FROM mail_send_intents WHERE id=? AND claim_token=? AND state=?)`,
    [outcome.state, outcome.messageId, outcome.code, new Date().toISOString(), JSON.stringify(outcome.recipientResults ?? []), input.intentId, input.intentId, input.claimToken, outcome.state]),
    statement(`UPDATE mail_drafts SET state=? WHERE active_intent_id=?
      AND EXISTS(SELECT 1 FROM mail_send_intents WHERE id=? AND claim_token=? AND state=?)`,
    [outcome.state, input.intentId, input.intentId, input.claimToken, outcome.state]),
    statement(`INSERT INTO mail_audit (mailbox_id,actor_id,action,target_id,safe_metadata)
      SELECT mailbox_id,NULL,?,id,'{}' FROM mail_send_intents WHERE id=? AND claim_token=? AND state=?`,
    [`mail.${outcome.state}`, input.intentId, input.claimToken, outcome.state]),
  ]);
}

async function attachmentsFor(snapshot: typeof mailDraftSnapshots.$inferSelect): Promise<readonly Attachment[]> {
  const attachments: Attachment[] = [];
  for (const file of snapshot.attachments) {
    const object = await env.CLUB_FILES.get(file.key);
    if (!object) throw new Error('mail_attachment_unavailable');
    const bytes = await object.arrayBuffer();
    if (bytes.byteLength !== file.bytes || await digest(bytes) !== file.digest) throw new Error('mail_attachment_digest_mismatch');
    attachments.push({ filename: file.filename, contentType: file.contentType, content: bytes });
  }
  return attachments;
}

export async function drainMailboxQueue() {
  await recoverAbandoned();
  const rows = await db.select({ intent: mailSendIntents, mailbox: mailboxes, draft: mailDrafts, snapshot: mailDraftSnapshots, review: mailReviews })
    .from(mailSendIntents)
    .innerJoin(mailboxes, eq(mailboxes.id, mailSendIntents.mailboxId))
    .innerJoin(mailDrafts, eq(mailDrafts.id, mailSendIntents.draftId))
    .innerJoin(mailDraftSnapshots, eq(mailDraftSnapshots.id, mailSendIntents.approvedSnapshotId))
    .innerJoin(mailReviews, eq(mailReviews.id, mailSendIntents.approvalReviewId))
    .where(and(inArray(mailSendIntents.state, ['queued', 'scheduled']), lte(mailSendIntents.dueAt, new Date().toISOString())))
    .limit(10);
  for (const row of rows) await dispatchOne(row);
  return { examined: rows.length };
}

type DispatchRow = {
  readonly intent: typeof mailSendIntents.$inferSelect;
  readonly mailbox: typeof mailboxes.$inferSelect;
  readonly draft: typeof mailDrafts.$inferSelect;
  readonly snapshot: typeof mailDraftSnapshots.$inferSelect;
  readonly review: typeof mailReviews.$inferSelect;
};

async function dispatchOne(row: DispatchRow) {
  const { intent, mailbox, draft, snapshot, review } = row;
  // Pause is reversible and must not invalidate the approved snapshot.
  const paused = await statement('SELECT 1 FROM mail_outbound_switch WHERE id=1 AND paused=1').first();
  if (paused || mailbox.outboundPaused) return;
  const contentHash = await digest(canonicalContent(snapshot));
  const replyAllowed = !mailbox.repliesOnly || snapshot.conversationId !== null;
  const adapterAllowed = mailbox.outboundAdapter === 'cloudflare' || (mailbox.outboundAdapter === 'capture' && emailTestMode() === 'capture');
  const cloudflareAllowed = mailbox.outboundAdapter !== 'cloudflare' || (snapshot.category === 'correspondence' && snapshot.conversationId !== null);
  const staticValid = mailbox.status === 'active' && mailbox.policyVersion === review.policyVersion &&
    snapshot.contentHash === contentHash && review.contentHash === contentHash &&
    snapshot.fromAddress === mailbox.address && mailbox.categoryPolicy.includes(snapshot.category) &&
    (!mailbox.requireDistinctReviewer || (review.reviewerId !== draft.createdBy && review.reviewerId !== snapshot.createdBy)) &&
    replyAllowed && adapterAllowed && cloudflareAllowed;
  if (!staticValid) {
    await invalidate(intent, 'POLICY_OR_SNAPSHOT_CHANGED');
    return;
  }
  let attachments: readonly Attachment[];
  try {
    attachments = await attachmentsFor(snapshot);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    await invalidate(intent, 'ATTACHMENT_UNAVAILABLE');
    return;
  }
  const quota = await emailQuota();
  const reserved = await db.insert(emailHourCount).values({ hour: quota.hour, count: 1 }).onConflictDoUpdate({
    target: emailHourCount.hour, set: { count: sql`${emailHourCount.count}+1` }, setWhere: sql`${emailHourCount.count}<${quota.limit}`,
  }).returning({ hour: emailHourCount.hour });
  if (!reserved.length) return;
  const token = crypto.randomUUID();
  const required = [
    [review.reviewerId, intent.mailboxId, 'mailbox.review'],
    [review.reviewerId, intent.mailboxId, 'mailbox.approve'],
    [review.reviewerId, intent.mailboxId, 'mailbox.send'],
    [intent.createdBy, intent.mailboxId, 'mailbox.send'],
    [draft.createdBy, intent.mailboxId, 'mailbox.draft.create'],
    [draft.createdBy, intent.mailboxId, 'mailbox.draft.submit'],
  ];
  let keepReservation = false;
  try {
    const [claim] = await atomic([
      statement(`UPDATE mail_send_intents SET state='sending',claim_token=?,claimed_at=?,attempt_count=attempt_count+1
        WHERE id=? AND state IN ('queued','scheduled') AND julianday(due_at)<=julianday('now')
        AND EXISTS(SELECT 1 FROM mail_drafts d JOIN mail_reviews r ON r.id=d.approved_review_id
          JOIN mailboxes m ON m.id=d.mailbox_id WHERE d.id=mail_send_intents.draft_id
          AND d.current_snapshot_id=mail_send_intents.approved_snapshot_id AND d.active_intent_id=mail_send_intents.id
          AND d.state IN ('queued','scheduled') AND r.id=mail_send_intents.approval_review_id AND r.decision='approved'
          AND r.snapshot_id=d.current_snapshot_id AND r.content_hash=? AND r.policy_version=m.policy_version
          AND m.policy_version=? AND m.status='active' AND m.outbound_paused=0)
        AND NOT EXISTS(SELECT 1 FROM mail_outbound_switch WHERE id=1 AND paused=1)
        AND ${required.map(() => GRANT_SQL).join(' AND ')}`,
      [token, new Date().toISOString(), intent.id, contentHash, mailbox.policyVersion, ...required.flat()]),
      statement(`INSERT INTO mail_send_attempts (id,intent_id,attempt_no,provider,outcome,created_at)
        SELECT ?,id,attempt_count,?,'started',? FROM mail_send_intents WHERE id=? AND claim_token=? AND state='sending'`,
      [crypto.randomUUID(), mailbox.outboundAdapter, new Date().toISOString(), intent.id, token]),
      statement(`UPDATE mail_drafts SET state='sending' WHERE active_intent_id=?
        AND EXISTS(SELECT 1 FROM mail_send_intents WHERE id=? AND claim_token=? AND state='sending')`, [intent.id, intent.id, token]),
    ]);
    if (!claim.meta.changes) {
      await invalidate(intent, 'AUTHORIZATION_CHANGED');
      return;
    }
    // Once a provider call starts, a thrown error may mean acceptance. No replay.
    keepReservation = true;
    let outcome: TransportOutcome;
    try {
      outcome = await mailboxTransport.send({ content: snapshot, outboundId: intent.id, attachments });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      outcome = { state: 'outcome_unknown', messageId: null, code: 'PROVIDER_EXCEPTION' };
    }
    if (outcome.state === 'failed') keepReservation = false;
    await finish({ intentId: intent.id, claimToken: token, outcome });
  } finally {
    if (!keepReservation) {
      await db.update(emailHourCount).set({ count: sql`max(0,${emailHourCount.count}-1)` }).where(eq(emailHourCount.hour, quota.hour));
    }
  }
}

async function invalidate(intent: typeof mailSendIntents.$inferSelect, reason: string) {
  await atomic([
    statement(`UPDATE mail_send_intents SET state='cancelled',last_error=? WHERE id=? AND state IN ('queued','scheduled')`, [reason, intent.id]),
    statement(`UPDATE mail_drafts SET state='draft',approved_review_id=NULL,active_intent_id=NULL WHERE active_intent_id=?
      AND EXISTS(SELECT 1 FROM mail_send_intents WHERE id=? AND state='cancelled')`, [intent.id, intent.id]),
    auditStatement({ mailboxId: intent.mailboxId, actorId: null, action: 'mail.dispatch_blocked', targetId: intent.id }),
  ]);
}
