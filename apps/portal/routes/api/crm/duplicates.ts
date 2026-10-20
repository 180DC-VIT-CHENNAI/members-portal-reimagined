import { defineHandler } from 'void';
import { requireCrm, requireCrmAdmin } from '../../../src/server/crm/access';
import { duplicates } from '../../../src/server/crm/merge';

/** Possible duplicates by website domain and contact email, for review before a merge (CRM admins). */
export const GET = defineHandler(async (c) => {
  const principal = await requireCrm(c);
  requireCrmAdmin(principal);
  c.header('Cache-Control', 'private, no-store');
  return duplicates();
});
