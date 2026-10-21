import { crmOrganizations } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { organizationFields, searchQuery } from '../../../../src/server/crm/fields';
import { requireCrm } from '../../../../src/server/crm/access';
import { listOrganizations, organizationValues, visibleDuplicate } from '../../../../src/server/crm/records';
import { requirePermission } from '../../../../src/server/guard';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Organisations the caller owns or was granted (every one for CRM admins), optionally searched. */
export const GET = defineHandler.withValidator({ query: searchQuery })(async (c, { query }) => {
  const principal = await requireCrm(c);
  c.header('Cache-Control', 'private, no-store');
  return listOrganizations(principal, query.q);
});

/** Add an organisation owned by the caller. A visible one with the same website domain answers 409 with its id. */
export const POST = defineHandler.withValidator({ body: v.object(organizationFields) })(async (c, { body }) => {
  const actor = await requirePermission(c, 'crm.manage');
  await rateLimit(c, 'crm_write', 300, 3600);
  const values = organizationValues(body);
  const duplicateId = await visibleDuplicate(actor, values.domain ?? null);
  if (duplicateId) return c.json({ error: 'duplicate_organization', id: duplicateId }, 409);
  const id = crypto.randomUUID();
  await db.insert(crmOrganizations).values({ name: body.name, ...values, id, ownerId: actor.person.id, createdBy: actor.person.id });
  await audit(actor.person.id, 'crm.organization.create', 'crm_organization', id, { name: body.name });
  return c.json({ id }, 201);
});
