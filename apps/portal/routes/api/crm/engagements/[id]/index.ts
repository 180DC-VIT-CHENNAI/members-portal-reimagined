import { defineHandler } from 'void';
import { requireCrm } from '../../../../../src/server/crm/access';
import { engagementDetail, loadEngagement } from '../../../../../src/server/crm/engagements';
import { idParam } from '../../../../../src/server/http';

export const GET = defineHandler(async (c) => {
  const principal = await requireCrm(c);
  c.header('Cache-Control', 'private, no-store');
  return engagementDetail(await loadEngagement(principal, idParam(c)));
});
