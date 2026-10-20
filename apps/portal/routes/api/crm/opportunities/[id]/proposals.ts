import * as v from 'valibot';
import { defineHandler } from 'void';
import { audit } from '../../../../../src/server/audit';
import { loadOpportunity, requireCrm, requireEdit } from '../../../../../src/server/crm/access';
import { proposalContent } from '../../../../../src/server/crm/fields';
import { createProposal } from '../../../../../src/server/crm/proposals';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { singleLine } from '../../../../../src/server/validation';

/** Start a proposal for this opportunity with its first version. */
export const POST = defineHandler.withValidator({ body: v.object({ title: singleLine(200), ...proposalContent }) })(async (c, { body }) => {
  const actor = await requireCrm(c);
  const { opportunity, access } = await loadOpportunity(actor, idParam(c));
  requireEdit(access);
  await rateLimit(c, 'crm_write', 300, 3600);
  const { title, ...content } = body;
  const id = await createProposal(actor, opportunity, title, content);
  await audit(actor.person.id, 'crm.proposal.create', 'crm_proposal', id, { opportunityId: opportunity.id });
  return c.json({ id }, 201);
});
