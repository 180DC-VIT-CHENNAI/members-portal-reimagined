import { defineHandler } from 'void';
import { requireCrm } from '../../../../src/server/crm/access';
import { searchQuery } from '../../../../src/server/crm/fields';
import { searchContacts } from '../../../../src/server/crm/records';

/** Contacts the caller may see in full, searched by name or email. */
export const GET = defineHandler.withValidator({ query: searchQuery })(async (c, { query }) => {
  const principal = await requireCrm(c);
  c.header('Cache-Control', 'private, no-store');
  return searchContacts(principal, query.q);
});
