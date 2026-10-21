import { defineHandler } from 'void';
import { requireCrm } from '../../../../src/server/crm/access';
import { listEngagements } from '../../../../src/server/crm/engagements';

export const GET = defineHandler(async (c) => {
  const principal = await requireCrm(c);
  c.header('Cache-Control', 'private, no-store');
  return listEngagements(principal);
});
