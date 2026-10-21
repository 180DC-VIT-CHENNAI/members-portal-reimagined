import { crmContacts, crmEngagements, crmOpportunities, crmOrganizations, crmStages, crmTouchpoints, people } from '@schema';
import * as v from 'valibot';
import { and, asc, db, desc, eq, isNull, like, or, sql } from 'void/db';
import { badRequest, notFound } from '../http';
import { can } from '../permissions';
import { loadPersonPrincipal, type Principal } from '../principal';
import { contactView, type CrmAccess, type Organization, visibleContacts, visibleOrganizations } from './access';
import type { contactFields, organizationFields } from './fields';
import { normalizeDomain, normalizeEmail } from './rules';

type OrganizationInput = v.InferOutput<v.ObjectSchema<typeof organizationFields, undefined>>;
type ContactInput = v.InferOutput<v.ObjectSchema<typeof contactFields, undefined>>;

const pattern = (q: string | undefined) => (q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null);
const escaped = (column: Parameters<typeof like>[0], value: string) => sql`${column} like ${value} escape '\\'`;

/** Organisations the caller can see, with how many opportunities each has. */
export async function listOrganizations(principal: Principal, q?: string) {
  const needle = pattern(q?.toLowerCase());
  return db
    .select({
      id: crmOrganizations.id,
      name: crmOrganizations.name,
      domain: crmOrganizations.domain,
      industry: crmOrganizations.industry,
      lifecycle: crmOrganizations.lifecycle,
      ownerId: crmOrganizations.ownerId,
      ownerName: people.fullName,
      opportunities: sql<number>`(select count(*) from ${crmOpportunities} where ${crmOpportunities.organizationId} = ${crmOrganizations.id})`,
    })
    .from(crmOrganizations)
    .leftJoin(people, eq(people.id, crmOrganizations.ownerId))
    .where(
      and(
        isNull(crmOrganizations.mergedIntoId),
        visibleOrganizations(principal),
        needle ? or(escaped(sql`lower(${crmOrganizations.name})`, needle), escaped(crmOrganizations.domain, needle)) : undefined,
      ),
    )
    .orderBy(asc(crmOrganizations.name), asc(crmOrganizations.id))
    .limit(200);
}

/** A visible, unmerged organisation already using this domain, so creation can point at it instead. */
export async function visibleDuplicate(principal: Principal, domain: string | null): Promise<string | null> {
  if (!domain) return null;
  const [row] = await db
    .select({ id: crmOrganizations.id })
    .from(crmOrganizations)
    .where(and(eq(crmOrganizations.domain, domain), isNull(crmOrganizations.mergedIntoId), visibleOrganizations(principal)))
    .limit(1);
  return row?.id ?? null;
}

export function organizationValues(body: Partial<OrganizationInput>) {
  const values: Partial<typeof crmOrganizations.$inferInsert> = {};
  if (body.name !== undefined) values.name = body.name;
  if (body.website !== undefined) {
    values.website = body.website || null;
    values.domain = normalizeDomain(body.website);
    if (body.website && !values.domain) badRequest('invalid_website');
  }
  if (body.industry !== undefined) values.industry = body.industry || null;
  if (body.geography !== undefined) values.geography = body.geography || null;
  if (body.tags !== undefined) values.tags = [...new Set(body.tags)];
  if (body.lifecycle !== undefined) values.lifecycle = body.lifecycle;
  if (body.source !== undefined) values.source = body.source;
  return values;
}

export function contactValues(body: Partial<ContactInput>) {
  const values: Partial<typeof crmContacts.$inferInsert> = {};
  if (body.fullName !== undefined) values.fullName = body.fullName;
  if (body.roleTitle !== undefined) values.roleTitle = body.roleTitle || null;
  if (body.email !== undefined) values.email = normalizeEmail(body.email);
  if (body.phone !== undefined) values.phone = body.phone || null;
  if (body.consent !== undefined) values.consent = body.consent;
  if (body.doNotContact !== undefined) values.doNotContact = body.doNotContact;
  if (body.preferredChannel !== undefined) values.preferredChannel = body.preferredChannel || null;
  if (body.restrictedNotes !== undefined) values.restrictedNotes = body.restrictedNotes || null;
  return values;
}

/** 400 unless the person keeps access and may open the CRM (owners and grantees must). */
export async function requireCrmPerson(personId: string) {
  const target = await loadPersonPrincipal(personId);
  if (!target || !can(target.permissions, 'crm.view')) badRequest('person_without_crm_access');
  return target.person;
}

/** An organisation with its contacts, opportunities, touchpoints and engagements. */
export async function organizationDetail(org: Organization, access: CrmAccess) {
  const [owner, contacts, opportunities, touchpoints, engagements] = await Promise.all([
    org.ownerId ? db.select({ id: people.id, fullName: people.fullName }).from(people).where(eq(people.id, org.ownerId)) : Promise.resolve([]),
    db.select().from(crmContacts).where(and(eq(crmContacts.organizationId, org.id), isNull(crmContacts.mergedIntoId))).orderBy(asc(crmContacts.fullName)),
    db
      .select({ opportunity: crmOpportunities, stageLabel: crmStages.label, stageKind: crmStages.kind, ownerName: people.fullName })
      .from(crmOpportunities)
      .innerJoin(crmStages, eq(crmStages.id, crmOpportunities.stageId))
      .leftJoin(people, eq(people.id, crmOpportunities.ownerId))
      .where(eq(crmOpportunities.organizationId, org.id))
      .orderBy(desc(crmOpportunities.createdAt)),
    db.select().from(crmTouchpoints).where(eq(crmTouchpoints.organizationId, org.id)).orderBy(desc(crmTouchpoints.occurredAt)).limit(100),
    db
      .select({ id: crmEngagements.id, opportunityId: crmEngagements.opportunityId, status: crmEngagements.status, projectId: crmEngagements.projectId })
      .from(crmEngagements)
      .innerJoin(crmOpportunities, eq(crmOpportunities.id, crmEngagements.opportunityId))
      .where(eq(crmOpportunities.organizationId, org.id)),
  ]);
  return {
    ...org,
    owner: owner[0] ?? null,
    contacts: contacts.map((contact) => contactView(contact, access.private)),
    opportunities: opportunities.map(({ opportunity, ...rest }) => ({ ...opportunity, ...rest })),
    touchpoints,
    engagements,
    access,
  };
}

/** Contacts whose private fields the caller may read, matched by name or email. */
export async function searchContacts(principal: Principal, q?: string) {
  const needle = pattern(q?.toLowerCase());
  const rows = await db
    .select({ contact: crmContacts, organizationName: crmOrganizations.name })
    .from(crmContacts)
    .innerJoin(crmOrganizations, eq(crmOrganizations.id, crmContacts.organizationId))
    .where(
      and(
        isNull(crmContacts.mergedIntoId),
        isNull(crmOrganizations.mergedIntoId),
        visibleContacts(principal),
        needle ? or(escaped(sql`lower(${crmContacts.fullName})`, needle), escaped(crmContacts.email, needle)) : undefined,
      ),
    )
    .orderBy(asc(crmContacts.fullName), asc(crmContacts.id))
    .limit(200);
  return rows.map(({ contact, organizationName }) => ({ ...contactView(contact, true), organizationName }));
}

/** 404 unless the contact is live and belongs to this organisation. */
export async function contactInOrganization(principal: Principal, contactId: string, organizationId: string) {
  const [contact] = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(and(eq(crmContacts.id, contactId), eq(crmContacts.organizationId, organizationId), isNull(crmContacts.mergedIntoId), visibleContacts(principal)));
  if (!contact) notFound('contact_not_found');
  return contact.id;
}
