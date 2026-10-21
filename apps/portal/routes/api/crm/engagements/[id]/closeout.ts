import * as v from 'valibot';
import { defineHandler } from 'void';
import { audit } from '../../../../../src/server/audit';
import { requireCrm, requireEdit } from '../../../../../src/server/crm/access';
import { loadEngagement, updateCloseout } from '../../../../../src/server/crm/engagements';
import { closeoutFields } from '../../../../../src/server/crm/fields';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** Tick closeout checklist items, record feedback and the client's case-study consent. */
export const PATCH = defineHandler.withValidator({ body: v.object(closeoutFields) })(async (c, { body }) => {
  const actor = await requireCrm(c);
  const loaded = await loadEngagement(actor, idParam(c));
  requireEdit(loaded.access);
  await rateLimit(c, 'crm_write', 300, 3600);
  await updateCloseout(loaded.engagement, body);
  const { clientFeedback: _feedback, ...flags } = body;
  await audit(actor.person.id, 'crm.engagement.closeout', 'crm_engagement', loaded.engagement.id, flags);
  return { id: loaded.engagement.id };
});
