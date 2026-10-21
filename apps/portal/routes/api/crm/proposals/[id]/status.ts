import * as v from 'valibot';
import { defineHandler } from 'void';
import { audit } from '../../../../../src/server/audit';
import { requireCrm, requireEdit } from '../../../../../src/server/crm/access';
import { proposalFor, setProposalStatus } from '../../../../../src/server/crm/proposals';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** Mark a proposal sent to the client (freezing its version) or declined. */
export const POST = defineHandler.withValidator({ body: v.object({ status: v.picklist(['sent', 'declined']) }) })(async (c, { body }) => {
  const actor = await requireCrm(c);
  const { proposal, access } = await proposalFor(actor, idParam(c));
  requireEdit(access);
  await rateLimit(c, 'crm_write', 300, 3600);
  await setProposalStatus(proposal, body.status);
  await audit(actor.person.id, `crm.proposal.${body.status}`, 'crm_proposal', proposal.id, { version: proposal.currentVersion });
  return { id: proposal.id, status: body.status };
});
