import { defineHandler } from 'void';
import { audit } from '../../../../../src/server/audit';
import { loadOpportunity, requireCrm, requireEdit } from '../../../../../src/server/crm/access';
import { stageChange } from '../../../../../src/server/crm/fields';
import { moveStage } from '../../../../../src/server/crm/pipeline';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** Move an opportunity to another stage; losing it needs a reason code. */
export const POST = defineHandler.withValidator({ body: stageChange })(async (c, { body }) => {
  const actor = await requireCrm(c);
  const { opportunity, access } = await loadOpportunity(actor, idParam(c));
  requireEdit(access);
  await rateLimit(c, 'crm_write', 300, 3600);
  const moved = await moveStage(opportunity, body);
  await audit(actor.person.id, 'crm.opportunity.stage', 'crm_opportunity', opportunity.id, moved);
  return { id: opportunity.id, ...moved };
});
