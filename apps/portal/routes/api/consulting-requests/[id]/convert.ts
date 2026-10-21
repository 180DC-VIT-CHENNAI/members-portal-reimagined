import { defineHandler } from 'void';
import { audit } from '../../../../src/server/audit';
import { convertRequest } from '../../../../src/server/crm/convert';
import { requirePermission } from '../../../../src/server/guard';
import { forbidden, idParam } from '../../../../src/server/http';
import { can } from '../../../../src/server/permissions';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Create (or return) the CRM organisation, contact and opportunity for a consulting request; `created` says which. */
export const POST = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'consulting.manage');
  if (!can(actor.permissions, 'crm.manage')) forbidden();
  await rateLimit(c, 'crm_write', 300, 3600);
  const result = await convertRequest(actor, idParam(c));
  if (result.created) await audit(actor.person.id, 'crm.convert_request', 'consulting_request', idParam(c), { opportunityId: result.opportunityId });
  return result;
});
