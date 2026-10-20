import { consultingRequests, crmContacts, crmOpportunities, crmOrganizations } from '@schema';
import type { BatchItem } from 'drizzle-orm/batch';
import { and, db, eq, isNull } from 'void/db';
import { notFound } from '../http';
import type { Principal } from '../principal';
import { loadOpportunity, visibleOrganizations } from './access';
import { firstStageId } from './pipeline';
import { normalizeEmail, normalizeOrganizationName, organizationDomainOfEmail } from './rules';

/** An existing live organisation for this request: same email domain, else same normalised name. */
async function matchingOrganization(actor: Principal, domain: string | null, name: string) {
  if (domain) {
    const [byDomain] = await db
      .select({ id: crmOrganizations.id })
      .from(crmOrganizations)
      .where(and(eq(crmOrganizations.domain, domain), isNull(crmOrganizations.mergedIntoId), visibleOrganizations(actor)))
      .limit(1);
    if (byDomain) return byDomain.id;
  }
  const wanted = normalizeOrganizationName(name);
  const candidates = await db.select({ id: crmOrganizations.id, name: crmOrganizations.name }).from(crmOrganizations).where(and(isNull(crmOrganizations.mergedIntoId), visibleOrganizations(actor)));
  return candidates.find((candidate) => normalizeOrganizationName(candidate.name) === wanted)?.id ?? null;
}

async function existingConversion(principal: Principal, requestId: string) {
  const [linked] = await db.select({ id: crmOpportunities.id }).from(crmOpportunities).where(eq(crmOpportunities.consultingRequestId, requestId));
  if (!linked) return null;
  const { opportunity } = await loadOpportunity(principal, linked.id);
  return { organizationId: opportunity.organizationId, contactId: opportunity.primaryContactId, opportunityId: opportunity.id, created: false };
}

/**
 * Turn a consulting request into an organisation, contact and opportunity
 * owned by the caller, reusing an organisation with the same email domain (or
 * name) and a contact with the same email there. Converting again returns the
 * same records; someone who cannot see them gets 404 without their ids.
 */
export async function convertRequest(actor: Principal, requestId: string) {
  const [request] = await db.select().from(consultingRequests).where(eq(consultingRequests.id, requestId));
  if (!request) notFound('request_not_found');
  const again = await existingConversion(actor, request.id);
  if (again) return again;

  const email = normalizeEmail(request.email);
  const domain = organizationDomainOfEmail(request.email);
  const organizationId = (await matchingOrganization(actor, domain, request.organization)) ?? crypto.randomUUID();
  const [contact] = email
    ? await db
        .select({ id: crmContacts.id })
        .from(crmContacts)
        .where(and(eq(crmContacts.organizationId, organizationId), eq(crmContacts.email, email), isNull(crmContacts.mergedIntoId)))
    : [];
  const contactId = contact?.id ?? crypto.randomUUID();
  const opportunityId = crypto.randomUUID();
  const [existingOrganization] = await db.select({ id: crmOrganizations.id }).from(crmOrganizations).where(eq(crmOrganizations.id, organizationId));
  const stageId = await firstStageId();
  const statements: BatchItem<'sqlite'>[] = [
      ...(existingOrganization
        ? []
        : [
            db.insert(crmOrganizations).values({
              id: organizationId,
              name: request.organization,
              website: domain,
              domain,
              source: 'consulting_request',
              ownerId: actor.person.id,
              createdBy: actor.person.id,
            }),
          ]),
      ...(contact
        ? []
        : [
            db.insert(crmContacts).values({
              id: contactId,
              organizationId,
              fullName: request.name,
              roleTitle: request.roleInOrg,
              email,
              phone: request.phone,
              createdBy: actor.person.id,
            }),
          ]),
      db.insert(crmOpportunities).values({
        id: opportunityId,
        organizationId,
        primaryContactId: contactId,
        title: `${request.organization}: consulting request`,
        ownerId: actor.person.id,
        source: 'consulting_request',
        stageId,
        nextAction: 'Qualify the request and reply',
        consultingRequestId: request.id,
        createdBy: actor.person.id,
      }),
  ];
  try {
    const [first, ...rest] = statements;
    if (first) await db.batch([first, ...rest]);
  } catch (err) {
    const raced = await existingConversion(actor, request.id);
    if (raced) return raced;
    throw err;
  }
  return { organizationId, contactId, opportunityId, created: true };
}
