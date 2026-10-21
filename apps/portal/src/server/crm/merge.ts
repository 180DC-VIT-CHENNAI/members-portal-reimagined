import { crmContacts, crmOpportunities, crmOrganizations, crmRecordAccess, crmTouchpoints } from '@schema';
import { and, asc, db, eq, isNotNull, isNull, ne, sql } from 'void/db';
import { badRequest, notFound } from '../http';

/** Organisations sharing a website domain and contacts sharing an email: candidates for an admin merge. */
export async function duplicates() {
  const [organizations, contacts] = await Promise.all([
    db
      .select({ id: crmOrganizations.id, name: crmOrganizations.name, domain: crmOrganizations.domain, createdAt: crmOrganizations.createdAt })
      .from(crmOrganizations)
      .where(
        and(
          isNull(crmOrganizations.mergedIntoId),
          isNotNull(crmOrganizations.domain),
          sql`${crmOrganizations.domain} in (select domain from ${crmOrganizations} where merged_into_id is null and domain is not null group by domain having count(*) > 1)`,
        ),
      )
      .orderBy(asc(crmOrganizations.domain), asc(crmOrganizations.createdAt)),
    db
      .select({ id: crmContacts.id, fullName: crmContacts.fullName, email: crmContacts.email, organizationId: crmContacts.organizationId })
      .from(crmContacts)
      .where(
        and(
          isNull(crmContacts.mergedIntoId),
          isNotNull(crmContacts.email),
          sql`${crmContacts.email} in (select email from ${crmContacts} where merged_into_id is null and email is not null group by email having count(*) > 1)`,
        ),
      )
      .orderBy(asc(crmContacts.email)),
  ]);
  const group = <T, K extends keyof T>(rows: T[], key: K) => {
    const groups = new Map<T[K], T[]>();
    for (const row of rows) groups.set(row[key], [...(groups.get(row[key]) ?? []), row]);
    return [...groups.entries()].map(([value, records]) => ({ key: value, records }));
  };
  return { organizations: group(organizations, 'domain'), contacts: group(contacts, 'email') };
}

async function liveOrganization(id: string) {
  const [org] = await db.select().from(crmOrganizations).where(and(eq(crmOrganizations.id, id), isNull(crmOrganizations.mergedIntoId)));
  if (!org) notFound('organization_not_found');
  return org;
}

/**
 * Fold `sourceId` into `targetId`: contacts, opportunities, touchpoints and
 * grants move to the target (a grant the target already has wins), then the
 * source is marked merged and disappears from every list.
 */
export async function mergeOrganizations(targetId: string, sourceId: string) {
  if (targetId === sourceId) badRequest('same_record');
  const [target, source] = await Promise.all([liveOrganization(targetId), liveOrganization(sourceId)]);
  await db.batch([
    db.update(crmContacts).set({ organizationId: target.id }).where(eq(crmContacts.organizationId, source.id)),
    db.update(crmOpportunities).set({ organizationId: target.id }).where(eq(crmOpportunities.organizationId, source.id)),
    db.update(crmTouchpoints).set({ organizationId: target.id }).where(eq(crmTouchpoints.organizationId, source.id)),
    db
      .update(crmRecordAccess)
      .set({ recordId: target.id })
      .where(
        and(
          eq(crmRecordAccess.recordType, 'organization'),
          eq(crmRecordAccess.recordId, source.id),
          sql`${crmRecordAccess.personId} not in (select person_id from ${crmRecordAccess} where record_type = 'organization' and record_id = ${target.id})`,
        ),
      ),
    db.delete(crmRecordAccess).where(and(eq(crmRecordAccess.recordType, 'organization'), eq(crmRecordAccess.recordId, source.id))),
    db
      .update(crmOrganizations)
      .set({ ownerId: target.ownerId ?? source.ownerId, updatedAt: sql`datetime('now')` })
      .where(eq(crmOrganizations.id, target.id)),
    db.update(crmOrganizations).set({ mergedIntoId: target.id, updatedAt: sql`datetime('now')` }).where(eq(crmOrganizations.id, source.id)),
  ]);
  return { target, source };
}

async function liveContact(id: string) {
  const [contact] = await db.select().from(crmContacts).where(and(eq(crmContacts.id, id), isNull(crmContacts.mergedIntoId)));
  if (!contact) notFound('contact_not_found');
  return contact;
}

/** Fold one contact into another; both must already belong to the same organisation (merge organisations first). */
export async function mergeContacts(targetId: string, sourceId: string) {
  if (targetId === sourceId) badRequest('same_record');
  const [target, source] = await Promise.all([liveContact(targetId), liveContact(sourceId)]);
  if (target.organizationId !== source.organizationId) badRequest('different_organizations');
  await db.batch([
    db.update(crmTouchpoints).set({ contactId: target.id }).where(eq(crmTouchpoints.contactId, source.id)),
    db.update(crmOpportunities).set({ primaryContactId: target.id }).where(eq(crmOpportunities.primaryContactId, source.id)),
    db
      .update(crmRecordAccess)
      .set({ recordId: target.id })
      .where(
        and(
          eq(crmRecordAccess.recordType, 'contact'),
          eq(crmRecordAccess.recordId, source.id),
          sql`${crmRecordAccess.personId} not in (select person_id from ${crmRecordAccess} where record_type = 'contact' and record_id = ${target.id})`,
        ),
      ),
    db.delete(crmRecordAccess).where(and(eq(crmRecordAccess.recordType, 'contact'), eq(crmRecordAccess.recordId, source.id))),
    db
      .update(crmContacts)
      .set({ mergedIntoId: target.id, updatedAt: sql`datetime('now')` })
      .where(and(eq(crmContacts.id, source.id), ne(crmContacts.id, target.id))),
  ]);
  return { target, source };
}
