import { type CrmRecordType, crmContacts, crmOpportunities, crmOrganizations, crmRecordAccess } from '@schema';
import type { SQL } from 'drizzle-orm';
import type { Context } from 'hono';
import { and, db, eq, inArray, isNull, or, sql } from 'void/db';
import { requirePermission } from '../guard';
import { forbidden, notFound } from '../http';
import { can } from '../permissions';
import type { Principal } from '../principal';

/** What the caller may do with one CRM record. `private` covers contact email, phone, consent and notes. */
export interface CrmAccess {
  readonly view: boolean;
  readonly edit: boolean;
  readonly grants: boolean;
  readonly private: boolean;
}

const NONE: CrmAccess = { view: false, edit: false, grants: false, private: false };

export type Organization = typeof crmOrganizations.$inferSelect;
export type Opportunity = typeof crmOpportunities.$inferSelect;
export type Contact = typeof crmContacts.$inferSelect;

export const isCrmAdmin = (principal: Principal) => can(principal.permissions, 'crm.admin');

/** The signed-in member with CRM access (403 otherwise). Records they cannot see still answer 404. */
export function requireCrm(c: Context): Promise<Principal> {
  return requirePermission(c, 'crm.view');
}

export function requireCrmAdmin(principal: Principal): void {
  if (!isCrmAdmin(principal)) forbidden();
}

type GrantRole = 'owner' | 'collaborator' | null;

async function grantRole(principal: Principal, recordType: CrmRecordType, recordId: string): Promise<GrantRole> {
  const [row] = await db
    .select({ role: crmRecordAccess.role })
    .from(crmRecordAccess)
    .where(and(eq(crmRecordAccess.recordType, recordType), eq(crmRecordAccess.recordId, recordId), eq(crmRecordAccess.personId, principal.person.id)));
  return row?.role ?? null;
}

function accessFrom(principal: Principal, owns: boolean, role: GrantRole, privateFields: boolean): CrmAccess {
  const manage = can(principal.permissions, 'crm.manage');
  if (isCrmAdmin(principal)) return { view: true, edit: true, grants: true, private: true };
  if (owns || role === 'owner') return { view: true, edit: manage, grants: manage, private: privateFields };
  if (role === 'collaborator') return { view: true, edit: manage, grants: false, private: privateFields };
  return NONE;
}

export async function organizationAccess(principal: Principal, org: Organization): Promise<CrmAccess> {
  if (isCrmAdmin(principal)) return accessFrom(principal, true, null, true);
  return accessFrom(principal, org.ownerId === principal.person.id, await grantRole(principal, 'organization', org.id), true);
}

/** Opportunity rights: its own owner or grants, or any access to its organisation. */
export async function opportunityAccess(principal: Principal, opportunity: Opportunity, org: Organization): Promise<CrmAccess> {
  const viaOrg = await organizationAccess(principal, org);
  if (viaOrg.view) return viaOrg;
  return accessFrom(principal, opportunity.ownerId === principal.person.id, await grantRole(principal, 'opportunity', opportunity.id), false);
}

export async function contactAccess(principal: Principal, contact: Contact, org: Organization): Promise<CrmAccess> {
  const viaOrg = await organizationAccess(principal, org);
  if (viaOrg.view) return viaOrg;
  return accessFrom(principal, false, await grantRole(principal, 'contact', contact.id), true);
}

export async function loadOrganization(principal: Principal, id: string) {
  const [org] = await db.select().from(crmOrganizations).where(and(eq(crmOrganizations.id, id), isNull(crmOrganizations.mergedIntoId)));
  if (!org) notFound('organization_not_found');
  const access = await organizationAccess(principal, org);
  if (!access.view) notFound('organization_not_found');
  return { org, access };
}

export async function loadOpportunity(principal: Principal, id: string) {
  const [row] = await db
    .select({ opportunity: crmOpportunities, org: crmOrganizations })
    .from(crmOpportunities)
    .innerJoin(crmOrganizations, eq(crmOrganizations.id, crmOpportunities.organizationId))
    .where(eq(crmOpportunities.id, id));
  if (!row) notFound('opportunity_not_found');
  const access = await opportunityAccess(principal, row.opportunity, row.org);
  if (!access.view) notFound('opportunity_not_found');
  return { ...row, access };
}

export async function loadContact(principal: Principal, id: string) {
  const [row] = await db
    .select({ contact: crmContacts, org: crmOrganizations })
    .from(crmContacts)
    .innerJoin(crmOrganizations, eq(crmOrganizations.id, crmContacts.organizationId))
    .where(and(eq(crmContacts.id, id), isNull(crmContacts.mergedIntoId)));
  if (!row) notFound('contact_not_found');
  const access = await contactAccess(principal, row.contact, row.org);
  if (!access.view) notFound('contact_not_found');
  return { ...row, access };
}

export function requireEdit(access: CrmAccess): void {
  if (!access.edit) forbidden();
}

const grantedTo = (principal: Principal, recordType: CrmRecordType, recordId: SQL | typeof crmOrganizations.id) =>
  sql`exists (select 1 from ${crmRecordAccess} where ${crmRecordAccess.recordType} = ${recordType} and ${crmRecordAccess.recordId} = ${recordId} and ${crmRecordAccess.personId} = ${principal.person.id})`;

/** SQL twin of organizationAccess(...).view, for lists, search and counts. Undefined means everything. */
export function visibleOrganizations(principal: Principal): SQL | undefined {
  if (isCrmAdmin(principal)) return undefined;
  return or(eq(crmOrganizations.ownerId, principal.person.id), grantedTo(principal, 'organization', crmOrganizations.id));
}

const visibleOrganizationIds = (principal: Principal) =>
  db.select({ id: crmOrganizations.id }).from(crmOrganizations).where(visibleOrganizations(principal));

/** SQL twin of opportunityAccess(...).view. */
export function visibleOpportunities(principal: Principal): SQL | undefined {
  if (isCrmAdmin(principal)) return undefined;
  return or(
    eq(crmOpportunities.ownerId, principal.person.id),
    sql`exists (select 1 from ${crmRecordAccess} where ${crmRecordAccess.recordType} = 'opportunity' and ${crmRecordAccess.recordId} = ${crmOpportunities.id} and ${crmRecordAccess.personId} = ${principal.person.id})`,
    inArray(crmOpportunities.organizationId, visibleOrganizationIds(principal)),
  );
}

/** SQL twin of contactAccess(...).view: contacts whose private fields the caller may read. */
export function visibleContacts(principal: Principal): SQL | undefined {
  if (isCrmAdmin(principal)) return undefined;
  return or(
    sql`exists (select 1 from ${crmRecordAccess} where ${crmRecordAccess.recordType} = 'contact' and ${crmRecordAccess.recordId} = ${crmContacts.id} and ${crmRecordAccess.personId} = ${principal.person.id})`,
    inArray(crmContacts.organizationId, visibleOrganizationIds(principal)),
  );
}

/** A contact as the caller may see it: private fields only with organisation-level or contact access. */
export function contactView(contact: Contact, privateFields: boolean) {
  const base = { id: contact.id, organizationId: contact.organizationId, fullName: contact.fullName, roleTitle: contact.roleTitle };
  if (!privateFields) return { ...base, email: null, phone: null, consent: null, doNotContact: null, preferredChannel: null, restrictedNotes: null, private: false as const };
  return {
    ...base,
    email: contact.email,
    phone: contact.phone,
    consent: contact.consent,
    doNotContact: contact.doNotContact,
    preferredChannel: contact.preferredChannel,
    restrictedNotes: contact.restrictedNotes,
    private: true as const,
  };
}
