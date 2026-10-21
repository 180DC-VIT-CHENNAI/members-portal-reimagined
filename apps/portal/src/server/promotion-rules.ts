import type { PromotionStatus } from '../../db/schema/lifecycle.ts';

export type PromotionAction = 'approve' | 'reject' | 'withdraw';

export type PromotionDecision =
  | { ok: true; status: Exclude<PromotionStatus, 'pending'> }
  | { ok: false; httpStatus: 403 | 409; error: string };

const OUTCOME = { approve: 'approved', reject: 'rejected', withdraw: 'withdrawn' } as const satisfies Record<PromotionAction, PromotionStatus>;

/**
 * The proposal state machine: pending -> approved | rejected (by a second
 * person holding people.promotions.approve for the position) or withdrawn (by
 * its proposer). Neither the proposer nor the person being promoted may decide.
 */
export function decidePromotion(input: {
  status: PromotionStatus;
  proposedBy: string;
  personId: string;
  actorId: string;
  actorMayApprove: boolean;
  action: PromotionAction;
}): PromotionDecision {
  if (input.status !== 'pending') return { ok: false, httpStatus: 409, error: 'proposal_not_pending' };
  switch (input.action) {
    case 'withdraw':
      if (input.actorId !== input.proposedBy) return { ok: false, httpStatus: 403, error: 'only_proposer_can_withdraw' };
      return { ok: true, status: OUTCOME.withdraw };
    case 'approve':
    case 'reject':
      if (input.actorId === input.proposedBy) return { ok: false, httpStatus: 403, error: 'cannot_decide_own_proposal' };
      if (input.actorId === input.personId) return { ok: false, httpStatus: 403, error: 'cannot_decide_own_promotion' };
      if (!input.actorMayApprove) return { ok: false, httpStatus: 403, error: 'forbidden' };
      return { ok: true, status: OUTCOME[input.action] };
    default: {
      const unreachable: never = input.action;
      return unreachable;
    }
  }
}

/** Who may raise a proposal: anyone with people.edit for it, except for themselves. */
export function mayPropose(input: { proposerId: string; personId: string; proposerMayEdit: boolean }): { ok: true } | { ok: false; httpStatus: 400 | 403; error: string } {
  if (input.proposerId === input.personId) return { ok: false, httpStatus: 400, error: 'cannot_propose_self' };
  if (!input.proposerMayEdit) return { ok: false, httpStatus: 403, error: 'forbidden' };
  return { ok: true };
}
