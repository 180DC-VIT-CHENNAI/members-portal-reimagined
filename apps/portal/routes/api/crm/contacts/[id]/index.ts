import { crmContacts } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq, sql } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { contactView, loadContact, requireCrm, requireEdit } from '../../../../../src/server/crm/access';
import { contactFields } from '../../../../../src/server/crm/fields';
import { contactValues } from '../../../../../src/server/crm/records';
import { badRequest, idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  const principal = await requireCrm(c);
  c.header('Cache-Control', 'private, no-store');
  const { contact, org, access } = await loadContact(principal, idParam(c));
  return { ...contactView(contact, access.private), organizationName: org.name, access };
});

export const PATCH = defineHandler.withValidator({ body: v.partial(v.object(contactFields)) })(async (c, { body }) => {
  const actor = await requireCrm(c);
  const { contact, access } = await loadContact(actor, idParam(c));
  requireEdit(access);
  await rateLimit(c, 'crm_write', 300, 3600);
  const values = contactValues(body);
  if (!Object.keys(values).length) badRequest('nothing_to_change');
  await db.update(crmContacts).set({ ...values, updatedAt: sql`datetime('now')` }).where(eq(crmContacts.id, contact.id));
  await audit(actor.person.id, 'crm.contact.update', 'crm_contact', contact.id, { fields: Object.keys(body) });
  return { id: contact.id };
});
