import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decidePromotion, mayPropose } from './promotion-rules.ts';

const pending = { status: 'pending', proposedBy: 'proposer', personId: 'target', actorId: 'approver', actorMayApprove: true } as const;

test('a second person with approval permission approves or rejects a pending proposal', () => {
  assert.deepEqual(decidePromotion({ ...pending, action: 'approve' }), { ok: true, status: 'approved' });
  assert.deepEqual(decidePromotion({ ...pending, action: 'reject' }), { ok: true, status: 'rejected' });
});

test('the proposer cannot approve or reject their own proposal', () => {
  for (const action of ['approve', 'reject'] as const) {
    assert.deepEqual(decidePromotion({ ...pending, actorId: 'proposer', action }), { ok: false, httpStatus: 403, error: 'cannot_decide_own_proposal' });
  }
});

test('the person being promoted cannot decide their own promotion', () => {
  assert.deepEqual(decidePromotion({ ...pending, actorId: 'target', action: 'approve' }), { ok: false, httpStatus: 403, error: 'cannot_decide_own_promotion' });
});

test('approval needs people.promotions.approve for the position', () => {
  assert.deepEqual(decidePromotion({ ...pending, actorMayApprove: false, action: 'approve' }), { ok: false, httpStatus: 403, error: 'forbidden' });
});

test('only the proposer withdraws, and only while pending', () => {
  assert.deepEqual(decidePromotion({ ...pending, actorId: 'proposer', action: 'withdraw' }), { ok: true, status: 'withdrawn' });
  assert.deepEqual(decidePromotion({ ...pending, action: 'withdraw' }), { ok: false, httpStatus: 403, error: 'only_proposer_can_withdraw' });
});

test('decided proposals are final', () => {
  for (const status of ['approved', 'rejected', 'withdrawn'] as const) {
    for (const action of ['approve', 'reject', 'withdraw'] as const) {
      assert.deepEqual(decidePromotion({ ...pending, status, actorId: 'proposer', action }), { ok: false, httpStatus: 409, error: 'proposal_not_pending' });
    }
  }
});

test('nobody proposes themselves, and proposing needs people.edit', () => {
  assert.deepEqual(mayPropose({ proposerId: 'a', personId: 'a', proposerMayEdit: true }), { ok: false, httpStatus: 400, error: 'cannot_propose_self' });
  assert.deepEqual(mayPropose({ proposerId: 'a', personId: 'b', proposerMayEdit: false }), { ok: false, httpStatus: 403, error: 'forbidden' });
  assert.deepEqual(mayPropose({ proposerId: 'a', personId: 'b', proposerMayEdit: true }), { ok: true });
});
