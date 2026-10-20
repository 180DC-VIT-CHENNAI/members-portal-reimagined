import { defineHandler } from 'void';
import { audit } from '../../../../../src/server/audit';
import { requireCrm, requireEdit } from '../../../../../src/server/crm/access';
import { acceptFields } from '../../../../../src/server/crm/fields';
import { acceptProposal, proposalFor } from '../../../../../src/server/crm/proposals';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** The client accepted: create the engagement and its canonical project, and mark the opportunity won. */
export const POST = defineHandler.withValidator({ body: acceptFields })(async (c, { body }) => {
  const actor = await requireCrm(c);
  const { proposal, opportunity, org, access } = await proposalFor(actor, idParam(c));
  requireEdit(access);
  await rateLimit(c, 'crm_write', 300, 3600);
  const created = await acceptProposal(actor, proposal, opportunity, org, body);
  await audit(actor.person.id, 'crm.proposal.accept', 'crm_proposal', proposal.id, { ...created, opportunityId: opportunity.id, departmentIds: body.departmentIds });
  return c.json(created, 201);
});
