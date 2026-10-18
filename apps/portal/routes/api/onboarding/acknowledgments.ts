import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { ONBOARDING_ACK_KEYS, onboardingAcknowledgments } from '../../../db/schema/onboarding';
import { requirePrincipal } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';
import { allowedAcknowledgments, buildChecklist } from '../../../src/server/onboarding';

/**
 * Record that the signed-in person read a checklist item, or hid the
 * checklist. Repeating it keeps the first time. Returns the updated checklist.
 */
export const POST = defineHandler.withValidator({ body: v.object({ item: v.picklist(ONBOARDING_ACK_KEYS) }) })(async (c, { body }) => {
  const { person, permissions } = await requirePrincipal(c);
  const load = async () => {
    const rows = await db.select().from(onboardingAcknowledgments).where(eq(onboardingAcknowledgments.personId, person.id));
    return new Map(rows.map((row) => [row.item, row.acknowledgedAt]));
  };
  if (!allowedAcknowledgments(buildChecklist(person, permissions, await load())).has(body.item)) badRequest('onboarding_item_unavailable');
  await db.insert(onboardingAcknowledgments).values({ personId: person.id, item: body.item }).onConflictDoNothing();
  c.header('Cache-Control', 'private, no-store');
  return buildChecklist(person, permissions, await load());
});
