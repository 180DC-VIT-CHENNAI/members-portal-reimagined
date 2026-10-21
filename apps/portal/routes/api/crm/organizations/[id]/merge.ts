import * as v from 'valibot';
import { defineHandler } from 'void';
import { audit } from '../../../../../src/server/audit';
import { requireCrm, requireCrmAdmin } from '../../../../../src/server/crm/access';
import { mergeOrganizations } from '../../../../../src/server/crm/merge';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { id } from '../../../../../src/server/validation';

/** Merge the duplicate `sourceId` into this organization, re-pointing everything linked to it (CRM admins). */
export const POST = defineHandler.withValidator({ body: v.object({ sourceId: id }) })(async (c, { body }) => {
  const actor = await requireCrm(c);
  requireCrmAdmin(actor);
  await rateLimit(c, 'crm_write', 300, 3600);
  const { target, source } = await mergeOrganizations(idParam(c), body.sourceId);
  await audit(actor.person.id, 'crm.organization.merge', 'crm_organization', target.id, { sourceId: source.id });
  return { id: target.id, mergedId: source.id };
});
