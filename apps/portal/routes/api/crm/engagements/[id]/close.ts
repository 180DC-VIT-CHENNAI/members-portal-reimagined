import { defineHandler } from 'void';
import { audit } from '../../../../../src/server/audit';
import { requireCrm, requireEdit } from '../../../../../src/server/crm/access';
import { closeEngagement, loadEngagement } from '../../../../../src/server/crm/engagements';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** Close an engagement whose checklist is complete; with consent this adds an unpublished case-study draft. */
export const POST = defineHandler(async (c) => {
  const actor = await requireCrm(c);
  const loaded = await loadEngagement(actor, idParam(c));
  requireEdit(loaded.access);
  await rateLimit(c, 'crm_write', 300, 3600);
  const result = await closeEngagement(actor, loaded);
  await audit(actor.person.id, 'crm.engagement.close', 'crm_engagement', loaded.engagement.id, result);
  return result;
});
