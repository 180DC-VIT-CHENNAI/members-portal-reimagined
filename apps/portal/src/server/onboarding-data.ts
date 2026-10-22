import { onboardingAcknowledgments, onboardingPolicies } from '@schema';
import { asc, db, eq } from 'void/db';
import { buildChecklist } from './onboarding';
import type { Principal } from './principal';

export async function loadChecklist({ person, permissions }: Principal) {
  const [rows, policies] = await Promise.all([
    db.select().from(onboardingAcknowledgments).where(eq(onboardingAcknowledgments.personId, person.id)),
    db
      .select({ id: onboardingPolicies.id, title: onboardingPolicies.title, description: onboardingPolicies.description, href: onboardingPolicies.href })
      .from(onboardingPolicies)
      .where(eq(onboardingPolicies.active, true))
      .orderBy(asc(onboardingPolicies.createdAt)),
  ]);
  return buildChecklist(person, permissions, new Map(rows.map((row) => [row.item, row.acknowledgedAt])), policies);
}
