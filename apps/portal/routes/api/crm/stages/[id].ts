import { crmStages } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requireCrm, requireCrmAdmin } from '../../../../src/server/crm/access';
import { stageFields } from '../../../../src/server/crm/fields';
import { badRequest, idParam, notFound } from '../../../../src/server/http';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Rename, reorder or retire a stage. The won and lost stages keep their place and stay active. */
export const PATCH = defineHandler.withValidator({ body: v.partial(v.object(stageFields)) })(async (c, { body }) => {
  const actor = await requireCrm(c);
  requireCrmAdmin(actor);
  await rateLimit(c, 'crm_write', 300, 3600);
  const id = idParam(c);
  const [stage] = await db.select().from(crmStages).where(eq(crmStages.id, id));
  if (!stage) notFound('stage_not_found');
  if (stage.kind !== 'open' && (body.active === false || body.sortOrder !== undefined)) badRequest('closing_stage_fixed');
  if (!Object.keys(body).length) badRequest('nothing_to_change');
  await db.update(crmStages).set(body).where(eq(crmStages.id, id));
  await audit(actor.person.id, 'crm.stage.update', 'crm_stage', id, { fields: Object.keys(body) });
  return { id };
});
