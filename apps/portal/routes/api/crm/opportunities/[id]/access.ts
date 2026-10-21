import * as v from 'valibot';
import { defineHandler } from 'void';
import { grantFields } from '../../../../../src/server/crm/fields';
import { addGrant, listGrants, removeGrant } from '../../../../../src/server/crm/grants';
import { id } from '../../../../../src/server/validation';

/** Who has explicit access to this opportunity (its owners and CRM admins only). */
export const GET = defineHandler((c) => listGrants(c, 'opportunity'));

/** Grant someone with CRM access owner or collaborator rights on this opportunity. */
export const POST = defineHandler.withValidator({ body: grantFields })((c, { body }) => addGrant(c, 'opportunity', body));

/** Revoke a person's explicit access to this opportunity. */
export const DELETE = defineHandler.withValidator({ body: v.object({ personId: id }) })((c, { body }) => removeGrant(c, 'opportunity', body.personId));
