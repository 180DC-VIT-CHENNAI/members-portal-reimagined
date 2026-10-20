import * as v from 'valibot';
import { defineHandler } from 'void';
import { audit } from '../../../../../src/server/audit';
import { requireCrm, requireEdit } from '../../../../../src/server/crm/access';
import { proposalContent } from '../../../../../src/server/crm/fields';
import { proposalFor, reviseProposal } from '../../../../../src/server/crm/proposals';
import { idParam } from '../../../../../src/server/http';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** Write a new version of an undecided proposal; earlier versions are frozen. */
export const POST = defineHandler.withValidator({ body: v.object(proposalContent) })(async (c, { body }) => {
  const actor = await requireCrm(c);
  const { proposal, access } = await proposalFor(actor, idParam(c));
  requireEdit(access);
  await rateLimit(c, 'crm_write', 300, 3600);
  const version = await reviseProposal(actor, proposal, body);
  await audit(actor.person.id, 'crm.proposal.revise', 'crm_proposal', proposal.id, { version });
  return c.json({ id: proposal.id, version }, 201);
});
