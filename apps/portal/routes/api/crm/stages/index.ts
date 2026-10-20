import { crmStages } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requireCrm, requireCrmAdmin } from '../../../../src/server/crm/access';
import { stageFields } from '../../../../src/server/crm/fields';
import { listStages } from '../../../../src/server/crm/pipeline';
import { conflict } from '../../../../src/server/http';
import { rateLimit } from '../../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  await requireCrm(c);
  return listStages();
});

/** Add an open pipeline stage (CRM admins). */
export const POST = defineHandler.withValidator({ body: v.object({ id: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]{1,30}$/, 'invalid_stage_id')), ...stageFields }) })(async (c, { body }) => {
  const actor = await requireCrm(c);
  requireCrmAdmin(actor);
  await rateLimit(c, 'crm_write', 300, 3600);
  const [added] = await db
    .insert(crmStages)
    .values({ id: body.id, label: body.label, kind: 'open', sortOrder: body.sortOrder ?? 100, active: body.active ?? true })
    .onConflictDoNothing()
    .returning({ id: crmStages.id });
  if (!added) conflict('stage_exists');
  await audit(actor.person.id, 'crm.stage.create', 'crm_stage', body.id, { label: body.label });
  return c.json({ id: body.id }, 201);
});
