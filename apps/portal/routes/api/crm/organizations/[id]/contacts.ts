import { crmContacts } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { loadOrganization, requireCrm, requireEdit } from '../../../../../src/server/crm/access';
import { contactFields } from '../../../../../src/server/crm/fields';
import { contactValues } from '../../../../../src/server/crm/records';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** Add a contact to an organisation the caller may edit. */
export const POST = defineHandler.withValidator({ body: v.object(contactFields) })(async (c, { body }) => {
  const actor = await requireCrm(c);
  const { org, access } = await loadOrganization(actor, idParam(c));
  requireEdit(access);
  await rateLimit(c, 'crm_write', 300, 3600);
  const id = crypto.randomUUID();
  await db.insert(crmContacts).values({ fullName: body.fullName, ...contactValues(body), id, organizationId: org.id, createdBy: actor.person.id });
  await audit(actor.person.id, 'crm.contact.create', 'crm_contact', id, { organizationId: org.id });
  return c.json({ id }, 201);
});
