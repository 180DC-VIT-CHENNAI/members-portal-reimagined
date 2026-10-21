import { crmOrganizations } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq, sql } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { loadOrganization, requireCrm, requireEdit } from '../../../../../src/server/crm/access';
import { organizationFields } from '../../../../../src/server/crm/fields';
import { organizationDetail, organizationValues, requireCrmPerson } from '../../../../../src/server/crm/records';
import { badRequest, forbidden, idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { id } from '../../../../../src/server/validation';

export const GET = defineHandler(async (c) => {
  const principal = await requireCrm(c);
  c.header('Cache-Control', 'private, no-store');
  const { org, access } = await loadOrganization(principal, idParam(c));
  return organizationDetail(org, access);
});

/** Edit an organisation. Changing its owner needs the right to manage its grants. */
export const PATCH = defineHandler.withValidator({ body: v.partial(v.object({ ...organizationFields, ownerId: id })) })(async (c, { body }) => {
  const actor = await requireCrm(c);
  const { org, access } = await loadOrganization(actor, idParam(c));
  requireEdit(access);
  await rateLimit(c, 'crm_write', 300, 3600);
  const { ownerId, ...fields } = body;
  const values = organizationValues(fields);
  if (ownerId !== undefined) {
    if (!access.grants) forbidden();
    values.ownerId = (await requireCrmPerson(ownerId)).id;
  }
  if (!Object.keys(values).length) badRequest('nothing_to_change');
  await db.update(crmOrganizations).set({ ...values, updatedAt: sql`datetime('now')` }).where(eq(crmOrganizations.id, org.id));
  await audit(actor.person.id, 'crm.organization.update', 'crm_organization', org.id, { fields: Object.keys(body) });
  return { id: org.id };
});
