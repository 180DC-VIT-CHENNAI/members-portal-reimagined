import { onboardingPolicies } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePermission } from '../../../../src/server/guard';
import { badRequest, idParam, notFound } from '../../../../src/server/http';
import { policyHref, singleLine } from '../../../../src/server/validation';

/** Edit or retire (`active: false`) a policy. Existing acknowledgments are kept. */
export const PATCH = defineHandler.withValidator({
  body: v.object({
    title: v.optional(singleLine(120)),
    description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500))),
    href: v.optional(v.nullable(policyHref)),
    active: v.optional(v.boolean()),
  }),
})(async (c, { body }) => {
  const actor = await requirePermission(c, 'onboarding.manage');
  if (Object.keys(body).length === 0) badRequest('nothing_to_update');
  const [updated] = await db.update(onboardingPolicies).set(body).where(eq(onboardingPolicies.id, idParam(c))).returning();
  if (!updated) notFound('policy_not_found');
  await audit(actor.person.id, 'onboarding_policy.update', 'onboarding_policy', updated.id, { fields: Object.keys(body) });
  return updated;
});
