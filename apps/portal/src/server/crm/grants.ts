import { type CrmRecordType, crmRecordAccess, people } from '@schema';
import type { Context } from 'hono';
import { and, asc, db, eq } from 'void/db';
import { audit } from '../audit';
import { conflict, forbidden, idParam, notFound } from '../http';
import type { Principal } from '../principal';
import { rateLimit } from '../rate-limit';
import { type CrmAccess, loadContact, loadOpportunity, loadOrganization, requireCrm } from './access';
import { requireCrmPerson } from './records';

async function recordAccess(principal: Principal, recordType: CrmRecordType, recordId: string): Promise<CrmAccess> {
  switch (recordType) {
    case 'organization':
      return (await loadOrganization(principal, recordId)).access;
    case 'opportunity':
      return (await loadOpportunity(principal, recordId)).access;
    case 'contact':
      return (await loadContact(principal, recordId)).access;
  }
}

/** The caller and the record, after 404 for records they cannot see and 403 unless they may manage its grants. */
async function grantContext(c: Context, recordType: CrmRecordType) {
  const actor = await requireCrm(c);
  const recordId = idParam(c);
  const access = await recordAccess(actor, recordType, recordId);
  if (!access.grants) forbidden();
  return { actor, recordId };
}

/** Who was granted this record, for its owners and CRM admins. */
export async function listGrants(c: Context, recordType: CrmRecordType) {
  const { recordId } = await grantContext(c, recordType);
  return db
    .select({ id: crmRecordAccess.id, personId: crmRecordAccess.personId, fullName: people.fullName, role: crmRecordAccess.role, createdAt: crmRecordAccess.createdAt })
    .from(crmRecordAccess)
    .innerJoin(people, eq(people.id, crmRecordAccess.personId))
    .where(and(eq(crmRecordAccess.recordType, recordType), eq(crmRecordAccess.recordId, recordId)))
    .orderBy(asc(people.fullName));
}

export async function addGrant(c: Context, recordType: CrmRecordType, body: { personId: string; role?: 'owner' | 'collaborator' }) {
  const { actor, recordId } = await grantContext(c, recordType);
  await rateLimit(c, 'crm_write', 300, 3600);
  const person = await requireCrmPerson(body.personId);
  const role = body.role ?? 'collaborator';
  const id = crypto.randomUUID();
  const [added] = await db
    .insert(crmRecordAccess)
    .values({ id, recordType, recordId, personId: person.id, role, createdBy: actor.person.id })
    .onConflictDoNothing()
    .returning({ id: crmRecordAccess.id });
  if (!added) conflict('already_granted');
  await audit(actor.person.id, 'crm.grant.add', `crm_${recordType}`, recordId, { personId: person.id, role });
  return c.json({ id }, 201);
}

export async function removeGrant(c: Context, recordType: CrmRecordType, personId: string) {
  const { actor, recordId } = await grantContext(c, recordType);
  await rateLimit(c, 'crm_write', 300, 3600);
  const [removed] = await db
    .delete(crmRecordAccess)
    .where(and(eq(crmRecordAccess.recordType, recordType), eq(crmRecordAccess.recordId, recordId), eq(crmRecordAccess.personId, personId)))
    .returning({ id: crmRecordAccess.id });
  if (!removed) notFound('grant_not_found');
  await audit(actor.person.id, 'crm.grant.remove', `crm_${recordType}`, recordId, { personId });
  return { removed: true };
}
