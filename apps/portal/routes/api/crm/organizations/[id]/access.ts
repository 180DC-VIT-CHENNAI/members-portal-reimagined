import * as v from 'valibot';
import { defineHandler } from 'void';
import { grantFields } from '../../../../../src/server/crm/fields';
import { addGrant, listGrants, removeGrant } from '../../../../../src/server/crm/grants';
import { id } from '../../../../../src/server/validation';

/** Who has explicit access to this organization (its owners and CRM admins only). */
export const GET = defineHandler((c) => listGrants(c, 'organization'));

/** Grant someone with CRM access owner or collaborator rights on this organization. */
export const POST = defineHandler.withValidator({ body: grantFields })((c, { body }) => addGrant(c, 'organization', body));

/** Revoke a person's explicit access to this organization. */
export const DELETE = defineHandler.withValidator({ body: v.object({ personId: id }) })((c, { body }) => removeGrant(c, 'organization', body.personId));
