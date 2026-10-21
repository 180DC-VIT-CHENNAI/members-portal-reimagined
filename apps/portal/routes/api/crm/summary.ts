import { defineHandler } from 'void';
import { isCrmAdmin, requireCrm } from '../../../src/server/crm/access';
import { listStages, pipelineCounts } from '../../../src/server/crm/pipeline';
import { can } from '../../../src/server/permissions';

/** Pipeline stages with how many visible opportunities each holds, and what the caller may do. */
export const GET = defineHandler(async (c) => {
  const principal = await requireCrm(c);
  c.header('Cache-Control', 'private, no-store');
  const [stages, counts] = await Promise.all([listStages(), pipelineCounts(principal)]);
  return { stages, counts, canManage: can(principal.permissions, 'crm.manage'), isAdmin: isCrmAdmin(principal) };
});
