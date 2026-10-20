import * as v from 'valibot';
import { defineHandler } from 'void';
import { grantFields } from '../../../../../src/server/crm/fields';
import { addGrant, listGrants, removeGrant } from '../../../../../src/server/crm/grants';
import { id } from '../../../../../src/server/validation';

/** Who has explicit access to this contact (its owners and CRM admins only). */
export const GET = defineHandler((c) => listGrants(c, 'contact'));

/** Grant someone with CRM access owner or collaborator rights on this contact. */
export const POST = defineHandler.withValidator({ body: grantFields })((c, { body }) => addGrant(c, 'contact', body));

/** Revoke a person's explicit access to this contact. */
export const DELETE = defineHandler.withValidator({ body: v.object({ personId: id }) })((c, { body }) => removeGrant(c, 'contact', body.personId));
