import { crmOpportunities } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq, sql } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { loadOpportunity, requireCrm, requireEdit } from '../../../../../src/server/crm/access';
import { opportunityFields } from '../../../../../src/server/crm/fields';
import { opportunityDetail } from '../../../../../src/server/crm/pipeline';
import { contactInOrganization, requireCrmPerson } from '../../../../../src/server/crm/records';
import { badRequest, forbidden, idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { id } from '../../../../../src/server/validation';

export const GET = defineHandler(async (c) => {
  const principal = await requireCrm(c);
  c.header('Cache-Control', 'private, no-store');
  const { opportunity, org, access } = await loadOpportunity(principal, idParam(c));
  return opportunityDetail(principal, opportunity, org, access);
});

/** Edit an opportunity's details or next step. Reassigning its owner needs the right to manage its grants. */
export const PATCH = defineHandler.withValidator({ body: v.partial(v.object({ ...opportunityFields, ownerId: id })) })(async (c, { body }) => {
  const actor = await requireCrm(c);
  const { opportunity, access } = await loadOpportunity(actor, idParam(c));
  requireEdit(access);
  await rateLimit(c, 'crm_write', 300, 3600);
  const values: Partial<typeof crmOpportunities.$inferInsert> = {};
  if (body.title !== undefined) values.title = body.title;
  if (body.source !== undefined) values.source = body.source;
  if (body.priority !== undefined) values.priority = body.priority;
  if (body.nextAction !== undefined) values.nextAction = body.nextAction || null;
  if (body.nextActionDue !== undefined) values.nextActionDue = body.nextActionDue;
  if (body.primaryContactId !== undefined) {
    values.primaryContactId = body.primaryContactId ? await contactInOrganization(actor, body.primaryContactId, opportunity.organizationId) : null;
  }
  if (body.ownerId !== undefined) {
    if (!access.grants) forbidden();
    values.ownerId = (await requireCrmPerson(body.ownerId)).id;
  }
  if (!Object.keys(values).length) badRequest('nothing_to_change');
  await db.update(crmOpportunities).set({ ...values, updatedAt: sql`datetime('now')` }).where(eq(crmOpportunities.id, opportunity.id));
  await audit(actor.person.id, 'crm.opportunity.update', 'crm_opportunity', opportunity.id, { fields: Object.keys(body) });
  return { id: opportunity.id };
});
