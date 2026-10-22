import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { ONBOARDING_ACK_KEYS, type OnboardingAckItem, onboardingAcknowledgments } from '../../../db/schema/onboarding';
import { requirePrincipal } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';
import { allowedAcknowledgments } from '../../../src/server/onboarding';
import { loadChecklist } from '../../../src/server/onboarding-data';

const policyItem = v.pipe(
  v.string(),
  v.regex(/^policy:[\w-]{1,64}$/),
  v.transform((value) => `policy:${value.slice(7)}` as const),
);

/**
 * Record that the signed-in person read a checklist item (including a policy,
 * as `policy:<id>`), or hid the checklist. Repeating it keeps the first time.
 * Returns the updated checklist.
 */
export const POST = defineHandler.withValidator({ body: v.object({ item: v.union([v.picklist(ONBOARDING_ACK_KEYS), policyItem]) }) })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  const item: OnboardingAckItem = body.item;
  if (!allowedAcknowledgments(await loadChecklist(principal)).has(item)) badRequest('onboarding_item_unavailable');
  await db.insert(onboardingAcknowledgments).values({ personId: principal.person.id, item }).onConflictDoNothing();
  c.header('Cache-Control', 'private, no-store');
  return loadChecklist(principal);
});
