import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { onboardingAcknowledgments } from '../../../db/schema/onboarding';
import { requirePrincipal } from '../../../src/server/guard';
import { buildChecklist } from '../../../src/server/onboarding';

/** The signed-in person's first-login checklist. It never blocks anything; it only reports what is left. */
export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  const rows = await db.select().from(onboardingAcknowledgments).where(eq(onboardingAcknowledgments.personId, principal.person.id));
  c.header('Cache-Control', 'private, no-store');
  return buildChecklist(principal.person, principal.permissions, new Map(rows.map((row) => [row.item, row.acknowledgedAt])));
});
