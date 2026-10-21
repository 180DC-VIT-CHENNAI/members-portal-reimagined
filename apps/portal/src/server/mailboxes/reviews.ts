import { mailDrafts } from '@schema';
import * as v from 'valibot';
import { db, eq } from 'void/db';
import { conflict, forbidden } from '../http';
import type { Principal } from '../principal';
import { atomic, auditStatement, GRANT_SQL, requireCapability, statement } from './access';
import { draftFor } from './drafts';
import { canonicalContent, digest } from './rules';
import { reviewInput } from './validation';
import { notifyReview } from './notices';

export async function submitDraft(actor: Principal, mailboxId: string, draftId: string, revision: number) {
  const loaded = await draftFor(actor, mailboxId, draftId);
  requireCapability(loaded, 'mailbox.draft.submit');
  if (loaded.draft.createdBy !== actor.person.id && !loaded.capabilities.includes('mailbox.draft.edit_any')) forbidden();
  if (!['draft', 'changes_requested'].includes(loaded.draft.state) || loaded.draft.revision !== revision) conflict('draft_changed');
  return recordReview({
    actor, loaded, revision, decision: 'submitted', comments: '',
    expectedState: loaded.draft.state, required: ['mailbox.draft.submit'],
  });
}

export async function reviewDraft(actor: Principal, mailboxId: string, draftId: string, input: v.InferOutput<typeof reviewInput>) {
  const loaded = await draftFor(actor, mailboxId, draftId);
  requireCapability(loaded, 'mailbox.review');
  const required: ('mailbox.review' | 'mailbox.approve' | 'mailbox.send')[] = ['mailbox.review'];
  if (input.decision === 'approved') {
    requireCapability(loaded, 'mailbox.approve');
    requireCapability(loaded, 'mailbox.send');
    required.push('mailbox.approve', 'mailbox.send');
    if (loaded.mailbox.requireDistinctReviewer && (loaded.draft.createdBy === actor.person.id || loaded.snapshot.createdBy === actor.person.id)) {
      forbidden('distinct_reviewer_required');
    }
    if (await digest(canonicalContent(loaded.snapshot)) !== loaded.snapshot.contentHash) conflict('snapshot_changed');
  }
  if (loaded.draft.state !== 'submitted' || loaded.draft.revision !== input.revision) conflict('draft_changed');
  return recordReview({ actor, loaded, revision: input.revision, decision: input.decision, comments: input.comments, expectedState: 'submitted', required });
}

async function recordReview(input: {
  readonly actor: Principal;
  readonly loaded: Awaited<ReturnType<typeof draftFor>>;
  readonly revision: number;
  readonly decision: 'submitted' | 'approved' | 'changes_requested' | 'rejected';
  readonly expectedState: string;
  readonly comments: string;
  readonly required: readonly ('mailbox.draft.submit' | 'mailbox.review' | 'mailbox.approve' | 'mailbox.send')[];
}) {
  const { loaded, actor } = input;
  if (loaded.mailbox.status !== 'active') conflict('mailbox_inactive');
  const reviewId = crypto.randomUUID();
  const grants = input.required.flatMap((cap) => [actor.person.id, loaded.mailbox.id, cap]);
  const [result] = await atomic([
    statement(`UPDATE mail_drafts SET state=?,last_review_id=?,approved_review_id=?,updated_at=?
      WHERE id=? AND revision=? AND state=? AND current_snapshot_id=?
        AND EXISTS(SELECT 1 FROM mailboxes WHERE id=? AND policy_version=? AND status='active')
        AND ${input.required.map(() => GRANT_SQL).join(' AND ')}`,
    [input.decision, reviewId, input.decision === 'approved' ? reviewId : null, new Date().toISOString(),
      loaded.draft.id, input.revision, input.expectedState, loaded.snapshot.id,
      loaded.mailbox.id, loaded.mailbox.policyVersion, ...grants]),
    statement(`INSERT INTO mail_reviews (id,draft_id,snapshot_id,content_hash,policy_version,reviewer_id,decision,comments)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM mail_drafts WHERE id=? AND last_review_id=?)`,
    [reviewId, loaded.draft.id, loaded.snapshot.id, loaded.snapshot.contentHash, loaded.mailbox.policyVersion,
      actor.person.id, input.decision, input.comments, loaded.draft.id, reviewId]),
    ...(input.decision === 'submitted' ? [notifyReview(loaded.draft.id, reviewId, actor.person.id)] : []),
    auditStatement({ mailboxId: loaded.mailbox.id, actorId: actor.person.id, action: `mail.${input.decision}`, targetId: loaded.draft.id,
      condition: { sql: 'EXISTS(SELECT 1 FROM mail_reviews WHERE id=?)', values: [reviewId] } }),
  ]);
  if (!result.meta.changes) conflict('draft_or_permission_changed');
  const [draft] = await db.select().from(mailDrafts).where(eq(mailDrafts.id, loaded.draft.id));
  return { id: loaded.draft.id, state: draft.state, revision: draft.revision };
}
