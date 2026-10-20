import { defineHandler } from 'void';
import { requireCrm } from '../../../../src/server/crm/access';
import { searchQuery } from '../../../../src/server/crm/fields';
import { listOpportunities } from '../../../../src/server/crm/pipeline';

/** Opportunities the caller can see, newest activity first, optionally searched. */
export const GET = defineHandler.withValidator({ query: searchQuery })(async (c, { query }) => {
  const principal = await requireCrm(c);
  c.header('Cache-Control', 'private, no-store');
  return listOpportunities(principal, query.q);
});
