import { defineHandler } from 'void';
import { requirePrincipal } from '../../../src/server/guard';
import { loadChecklist } from '../../../src/server/onboarding-data';

/** The signed-in person's first-login checklist. It never blocks anything; it only reports what is left. */
export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  c.header('Cache-Control', 'private, no-store');
  return loadChecklist(principal);
});
