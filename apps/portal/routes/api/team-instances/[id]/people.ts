import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { placeablePeople } from '../../../../src/server/team-instance-views';
import { instanceFor, requireInstanceRight } from '../../../../src/server/team-instances';

/** People the caller may place on this instance's teams, for the staffing picker. */
export const GET = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const loaded = await instanceFor(actor, idParam(c));
  requireInstanceRight(loaded, 'staff');
  return placeablePeople(actor, loaded);
});
