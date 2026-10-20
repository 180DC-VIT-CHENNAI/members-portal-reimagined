import { defineHandler } from 'void';
import { audit } from '../../../src/server/audit';
import { requireCrm } from '../../../src/server/crm/access';
import { touchpointFields } from '../../../src/server/crm/fields';
import { logTouchpoint } from '../../../src/server/crm/touchpoints';
import { rateLimit } from '../../../src/server/rate-limit';

/** Log a meeting, email reference, call, note or milestone on a record the caller may edit. */
export const POST = defineHandler.withValidator({ body: touchpointFields })(async (c, { body }) => {
  const actor = await requireCrm(c);
  await rateLimit(c, 'crm_write', 300, 3600);
  const created = await logTouchpoint(actor, body);
  await audit(actor.person.id, 'crm.touchpoint.create', 'crm_touchpoint', created.id, { kind: body.kind, organizationId: created.organizationId });
  return c.json(created, 201);
});
