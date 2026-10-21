import { onboardingPolicies } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { asc, db } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePermission } from '../../../../src/server/guard';
import { policyHref, singleLine } from '../../../../src/server/validation';

/** Every policy, active or retired (onboarding.manage). */
export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'onboarding.manage');
  return db.select().from(onboardingPolicies).orderBy(asc(onboardingPolicies.createdAt));
});

/** Add a policy every member acknowledges from their first-login checklist. */
export const POST = defineHandler.withValidator({
  body: v.object({
    title: singleLine(120),
    description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), ''),
    href: v.optional(v.nullable(policyHref)),
  }),
})(async (c, { body }) => {
  const actor = await requirePermission(c, 'onboarding.manage');
  const id = crypto.randomUUID();
  await db.insert(onboardingPolicies).values({ id, title: body.title, description: body.description, href: body.href ?? null, createdBy: actor.person.id });
  await audit(actor.person.id, 'onboarding_policy.create', 'onboarding_policy', id, { title: body.title });
  return c.json({ id }, 201);
});
