import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { instanceActivity } from '../../../../src/server/team-instance-views';
import { instanceFor } from '../../../../src/server/team-instances';

/** The latest 30 changes to the instance, for anyone who can see it. */
export const GET = defineHandler(async (c) => {
  const loaded = await instanceFor(await requirePrincipal(c), idParam(c));
  c.header('Cache-Control', 'private, no-store');
  return instanceActivity(loaded.instance.id);
});
