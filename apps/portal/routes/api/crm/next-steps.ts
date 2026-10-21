import { defineHandler } from 'void';
import { requireCrm } from '../../../src/server/crm/access';
import { myNextSteps } from '../../../src/server/crm/pipeline';

/** The caller's own open opportunities with a next step due today or earlier (UTC). */
export const GET = defineHandler(async (c) => {
  const principal = await requireCrm(c);
  c.header('Cache-Control', 'private, no-store');
  return myNextSteps(principal, new Date().toISOString().slice(0, 10));
});
