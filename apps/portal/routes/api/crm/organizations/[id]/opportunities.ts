import { crmOpportunities } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { loadOrganization, requireCrm, requireEdit } from '../../../../../src/server/crm/access';
import { opportunityFields } from '../../../../../src/server/crm/fields';
import { firstStageId } from '../../../../../src/server/crm/pipeline';
import { contactInOrganization } from '../../../../../src/server/crm/records';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** Open an opportunity, owned by the caller, at the first pipeline stage. */
export const POST = defineHandler.withValidator({ body: v.object(opportunityFields) })(async (c, { body }) => {
  const actor = await requireCrm(c);
  const { org, access } = await loadOrganization(actor, idParam(c));
  requireEdit(access);
  await rateLimit(c, 'crm_write', 300, 3600);
  const primaryContactId = body.primaryContactId ? await contactInOrganization(actor, body.primaryContactId, org.id) : null;
  const id = crypto.randomUUID();
  await db.insert(crmOpportunities).values({
    id,
    organizationId: org.id,
    primaryContactId,
    title: body.title,
    source: body.source ?? 'other',
    priority: body.priority ?? 'normal',
    nextAction: body.nextAction || null,
    nextActionDue: body.nextActionDue ?? null,
    stageId: await firstStageId(),
    ownerId: actor.person.id,
    createdBy: actor.person.id,
  });
  await audit(actor.person.id, 'crm.opportunity.create', 'crm_opportunity', id, { organizationId: org.id });
  return c.json({ id }, 201);
});
